import {it,expect,vi} from 'vitest'
import {Window} from 'happy-dom'
import {runInNewContext} from 'node:vm'
import {validWorkbenchStyleMessage,installWorkbenchStyleMessages,workbenchStylePalette,workbenchModeCss,installWorkbenchLocaleMessages} from '../packages/dsh-research-task-runtime/workbench-style.js'
import {WORKBENCH_ENGLISH} from '../packages/dsh-research-task-runtime/workbench-locale.js'
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
 expect(workbenchText('4 / 4 行','en')).toBe('4 / 4 rows');expect(workbenchText('按客户原始列名排序','en')).toBe('Sort by 客户原始列名')
})
it('企业化控件使用浅色品牌配色，客户端深色主题不覆盖组件控件',()=>{
 const w=new Window(),doc=w.document,style=doc.createElement('style');style.textContent=workbenchModeCss();doc.head.append(style)
 doc.documentElement.dataset.workbenchStyle='enterprise';doc.documentElement.dataset.workbenchControlTheme='dark'
 const p=w.getComputedStyle(doc.documentElement)
 expect(p.getPropertyValue('--sherlock-control-bg')).toBe('#f3f5f7')
 expect(p.getPropertyValue('--sherlock-control-text')).toBe('#005096')
 expect(p.getPropertyValue('--sherlock-control-primary')).toBe('#0078b4')
})
it('新闻筛选计数和控件辅助标签随语言切换，原文和用户输入保持',async()=>{
 const w=new Window(),doc=w.document;doc.body.dataset.researchKind='news';doc.body.innerHTML='<input aria-label="搜索条目" value="用户输入"><select aria-label="筛选分类"></select><p id="count" role="status">2 / 6 条</p><p id="business">2 / 6 条</p>'
 runInNewContext('('+installWorkbenchLocaleMessages.toString()+')(english)',{english:WORKBENCH_ENGLISH,addEventListener:w.addEventListener.bind(w),document:doc,parent:w.parent,MutationObserver:w.MutationObserver,NodeFilter:w.NodeFilter,queueMicrotask,validWorkbenchLocaleMessage:d=>d?.type==='sherlock-workbench-locale'})
 w.dispatchEvent(new w.Event('DOMContentLoaded'));w.dispatchEvent(new w.MessageEvent('message',{source:w.parent,data:{type:'sherlock-workbench-locale',locale:'en'}}))
 await vi.waitFor(()=>expect(doc.querySelector('#count').textContent).toBe('2 / 6 items'))
 expect(doc.querySelector('input').getAttribute('aria-label')).toBe('Search items');expect(doc.querySelector('select').getAttribute('aria-label')).toBe('Filter by category');expect(doc.querySelector('input').value).toBe('用户输入');expect(doc.querySelector('#business').textContent).toBe('2 / 6 条')
 doc.querySelector('#count').textContent='1 / 6 条';await vi.waitFor(()=>expect(doc.querySelector('#count').textContent).toBe('1 / 6 items'))
 w.dispatchEvent(new w.MessageEvent('message',{source:w.parent,data:{type:'sherlock-workbench-locale',locale:'zh'}}));await vi.waitFor(()=>expect(doc.querySelector('#count').textContent).toBe('1 / 6 条'));await w.happyDOM.abort()
})
