import {it,expect} from 'vitest'
import {Window} from 'happy-dom'
import {runInNewContext} from 'node:vm'
import {validWorkbenchStyleMessage,installWorkbenchStyleMessages,workbenchStylePalette} from '../packages/dsh-research-task-runtime/workbench-style.js'
import {createWorkbenchStyleState} from '../scripts/lib/workbench-style-client.mjs'
import {workbenchText} from '../scripts/lib/workbench-localization.mjs'
it('展示桥只接受父页面的三种已知模式，任意颜色和外来消息不能改写组件',()=>{
 const w=new Window(),doc=w.document;runInNewContext('('+installWorkbenchStyleMessages.toString()+')()',{addEventListener:w.addEventListener.bind(w),dispatchEvent:w.dispatchEvent.bind(w),document:doc,parent:w.parent,CustomEvent:w.CustomEvent,validWorkbenchStyleMessage})
 const message={type:'sherlock-workbench-style',mode:'enterprise',controlTheme:'dark'}
 w.dispatchEvent(new w.MessageEvent('message',{source:{},data:message}));expect(doc.documentElement.dataset.workbenchStyle).toBeUndefined()
 w.dispatchEvent(new w.MessageEvent('message',{source:w.parent,data:{...message,css:'body{display:none}'}}));expect(doc.documentElement.dataset.workbenchStyle).toBeUndefined()
 w.dispatchEvent(new w.MessageEvent('message',{source:w.parent,data:message}));expect(doc.documentElement.dataset.workbenchStyle).toBe('enterprise');expect(doc.documentElement.dataset.workbenchControlTheme).toBe('dark')
})
it('偏好存储损坏安全回退且企业色遵循设计稿的稳定系列顺序',()=>{
 const state=createWorkbenchStyleState({getItem:()=>'{invalid',setItem:()=>{}},'test');expect(state.get()).toBeNull();expect(state.set('enterprise')).toBe(true)
 const p=workbenchStylePalette('enterprise');expect(Array.from({length:8},(_,i)=>p['chart-'+(i+1)])).toEqual(['#005096','#1eb9e1','#969696','#3c3c3c','#0078b4','#b3ebff','#c1c6c8','#cccccc']);expect(p['market-positive']).toBe(workbenchStylePalette('light')['market-positive'])
})
it('英文动态操作提示和静态菜单翻译，不改写任意用户正文',()=>{
 expect(workbenchText('已整理 17 个组件','en')).toBe('Arranged 17 components');expect(workbenchText('编辑需求','en')).toBe('Edit requirements');expect(workbenchText('客户原始中文正文','en')).toBe('客户原始中文正文');expect(workbenchText('编辑需求','zh')).toBe('编辑需求')
})
