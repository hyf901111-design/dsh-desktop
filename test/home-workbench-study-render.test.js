// @vitest-environment jsdom
import {describe,it,expect} from 'vitest'
import React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import {renderToStaticMarkup} from 'react-dom/server'
import {createRoot} from 'react-dom/client'
import {runInNewContext} from 'node:vm'
import {homeWorkbenchStudyDefinitions} from '../scripts/lib/home-workbench-study.mjs'
import {homeWorkbenchStudySpec,synchronizeHomeWorkbenchStudies} from '../packages/dsh-research-task-runtime/home-workbench-study-contract.js'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
function render(role,security='600519',options={}){
 const context={react:React,react_jsx_runtime:jsxRuntime,homeWorkbenchStudySinks:new Map(),FinancialConnectionPort:({node,side})=>React.createElement('button',{'data-financial-port':side,'data-financial-port-node':node.id}),structuredClone};
 runInNewContext(homeWorkbenchStudyDefinitions()+';this.Study=HomeWorkbenchStudy',context)
 return renderToStaticMarkup(React.createElement(context.Study,{node:{id:'test',containerSpec:homeWorkbenchStudySpec(role,security,options)},sessionId:'s'}))
}
describe('研究组件原生可读内容',()=>{
 it('年报阅读包含正式全文、财务表和可核对经营结构，不额外绘制外壳',()=>{
  const html=render('reader')
  expect(html).toContain('1,688.38');expect(html).toContain('822.93');expect(html).toContain('茅台酒');expect(html).toContain('1225114741.PDF#page=6')
  expect(html).toContain('hws-footer');expect(html).not.toContain('<header');expect(html).not.toContain('<iframe')
 })
 it('同一阅读组件切证券和报告时显示对应事实及审计口径',()=>{
  const html=render('reader','000858',{reportKind:'quarter'})
  expect(html).toContain('228.38');expect(html).toContain('80.63');expect(html).toContain('未经审计');expect(html).toContain('更正')
  expect(html).not.toContain('1,688.38')
 })
 it('11种组件均呈现数据；可选入口具有真实按钮而静态矩阵是输出',()=>{
  for(const role of ['disclosure','performance','peers','valuation','matrix','dividend','cashflow','directory','reader','analysis','news']){
   const html=render(role)
   expect(html.length,role).toBeGreaterThan(250);expect(html,role).not.toContain('undefined');expect(html,role).not.toContain('[object Object]')
  }
  expect(render('directory')).toContain('aria-pressed="true"')
  expect(render('valuation')).toContain('aria-pressed="true"')
  expect(render('matrix')).toContain('只读')
 })
})

function interactive(roles){
 const container=document.createElement('div');document.body.appendChild(container)
 let artifacts=roles.map(([id,role,opts])=>({id,containerSpec:homeWorkbenchStudySpec(role,'600519',opts)}))
 const sinks=new Map(),context={react:React,react_jsx_runtime:jsxRuntime,homeWorkbenchStudySinks:sinks,FinancialConnectionPort:({node,side})=>React.createElement('button',{'data-financial-port':side,'data-financial-port-node':node.id}),structuredClone}
 runInNewContext(homeWorkbenchStudyDefinitions()+';this.Study=HomeWorkbenchStudy',context)
 const root=createRoot(container),draw=()=>root.render(React.createElement('div',null,...artifacts.map(node=>React.createElement(context.Study,{key:node.id,node,sessionId:'interactive'}))))
 sinks.set('interactive',(id,expected,next)=>{const current=artifacts.find(n=>n.id===id);if(current.containerSpec!==expected)return false;artifacts=synchronizeHomeWorkbenchStudies(artifacts.map(n=>n.id===id?{...n,containerSpec:next}:n));draw();return true})
 React.act(draw)
 return {container,click(selector){React.act(()=>container.querySelector(selector).click())},get:()=>artifacts,dispose(){React.act(()=>root.unmount());container.remove()}}
}
describe('用户点击产生持久化数据依赖更新',()=>{
 it('参数按钮更新自己及矩阵；不向矩阵放伪可点击格',()=>{
  const ui=interactive([['v','valuation',{}],['m','matrix',{linkedSourceId:'v'}]])
  try{ui.click('[data-hws-pe="25"]');ui.click('[data-hws-eps="5"]');expect(ui.container.querySelector('[data-hws-valuation-price]').textContent).toBe('1,723.58');expect(ui.container.querySelector('.hws-matrix-selected').textContent).toBe('1,723.58');expect(ui.get()[1].containerSpec.scenarios['600519']).toEqual({pe:25,epsChange:5})}finally{ui.dispose()}
 })
 it('点季报同时替换阅读和解读，显示来自同一资料目录的真实事实',()=>{
  const ui=interactive([['d','directory',{}],['r','reader',{linkedSourceId:'d'}],['a','analysis',{linkedSourceId:'d'}]])
  try{ui.click('[data-hws-document="quarter"]');expect(ui.container.querySelector('[data-hws-document="quarter"]').getAttribute('aria-pressed')).toBe('true');expect(ui.container.querySelector('[data-home-workbench-study="reader"]').textContent).toContain('539.09');expect(ui.container.querySelector('[data-home-workbench-study="analysis"]').textContent).toContain('直销295.04');expect(ui.get().map(n=>n.containerSpec.reportKind)).toEqual(['quarter','quarter','quarter'])}finally{ui.dispose()}
 })
})

it('未连接/上游无效时保留可重连的输入节点，目录仍有输出；固定组件不造端口',()=>{
 const directory=render('directory',null)
 expect(directory).toContain('等待连接上游');expect(directory).toContain('data-financial-port="input"');expect(directory).toContain('data-financial-port="output"')
 const reader=render('reader',null,{linkedSourceId:'directory'})
 expect(reader).toContain('等待上游选择');expect(reader).toContain('data-financial-port="input"');expect(reader).not.toContain('data-financial-port="output"')
 expect(render('peers')).not.toContain('data-financial-port')
 expect(render('news')).not.toContain('data-financial-port')
})
