import {it,expect,vi} from 'vitest'
import {Window} from 'happy-dom'
import {runInNewContext} from 'node:vm'
import {validWorkbenchStyleMessage,installWorkbenchStyleMessages,workbenchStylePalette,workbenchModeCss,installWorkbenchLocaleMessages} from '../packages/dsh-research-task-runtime/workbench-style.js'
import {WORKBENCH_PRESENTATION_CSS} from '../packages/dsh-research-task-runtime/workbench-presentation.js'
import {WORKBENCH_ENGLISH} from '../packages/dsh-research-task-runtime/workbench-locale.js'
import {createWorkbenchStyleState,workbenchFramePresentation,workbenchRequestedStyle} from '../scripts/lib/workbench-style-client.mjs'
import {workbenchText} from '../scripts/lib/workbench-localization.mjs'
it('展示桥只接受父页面的已知模式，任意颜色和外来消息不能改写组件',()=>{
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
it('企业化控件完整复用浅色配色，悬停为灰色且不受客户端深色影响',()=>{
 const w=new Window(),doc=w.document,style=doc.createElement('style');style.textContent=workbenchModeCss();doc.head.append(style)
 doc.documentElement.dataset.workbenchStyle='enterprise';doc.documentElement.dataset.workbenchControlTheme='dark'
 const p=w.getComputedStyle(doc.documentElement)
 for(const key of ['control-bg','control-border','control-text','control-muted','control-primary','control-on-primary'])expect(p.getPropertyValue('--sherlock-'+key)).toBe(workbenchStylePalette('light')[key])
 expect(p.getPropertyValue('--sherlock-row-selected')).toBe('#e8e8eb')
 expect(p.getPropertyValue('--sherlock-tooltip-bg')).toBe('#e8e8eb')
})
it('旧基金组件的选中行保持灰底深色文字，指标口径在企业色背景上反白',()=>{
 const w=new Window(),doc=w.document,style=doc.createElement('style')
 // HappyDOM has no cascade-layer implementation. The real preview keeps the
 // layer; here exercise the same declarations and legacy control conflicts.
 style.textContent=WORKBENCH_PRESENTATION_CSS.replace('@layer ework-workbench {','').replace(/}\s*$/,'')
 doc.head.append(style)
 doc.documentElement.dataset.workbenchStyle='enterprise'
 doc.body.innerHTML='<div class="fund-kpi"><strong class="fund-value">4.4181 元</strong><details class="fund-detail fund-detail-disclosure"><summary>fund_market · 2026-09-29</summary><p>原始数据口径和完整来源</p></details></div><button class="fund-industry" aria-pressed="true"><span class="fund-industry-label">电子</span><span class="fund-track"><i class="fund-bar"></i></span><span class="fund-industry-value">15.4%</span></button>'
 for(const n of doc.querySelectorAll('.fund-kpi summary,.fund-kpi p'))expect(w.getComputedStyle(n).color).toBe('white')
 const row=doc.querySelector('.fund-industry')
 expect(w.getComputedStyle(row).backgroundColor).toBe('#e8e8eb')
 for(const n of row.querySelectorAll('.fund-industry-label,.fund-industry-value'))expect(w.getComputedStyle(n).color).toBe('#3c3c3c')
 expect(w.getComputedStyle(row).borderRadius).toBe('0px')
 doc.documentElement.dataset.workbenchStyle='dark'
 expect(w.getComputedStyle(row).backgroundColor).toBe('#223147')
 expect(w.getComputedStyle(row.querySelector('.fund-industry-label')).color).toBe('#e8e8ed')
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

it.each(['note','conversation'])('组件本地四模式在全局深浅切换与画布祖先下优先，控件沿同一模式: %s',host=>{
 const w=new Window(),doc=w.document;doc.body.innerHTML='<main data-ework-grid data-workbench-style="enterprise"><section id="local"><iframe></iframe></section></main><iframe id="global"></iframe>';const root=doc.querySelector('#local'),frame=root.querySelector('iframe');root.setAttribute(host==='note'?'data-note-presentation':'data-conversation-component-id','local');
 for(const dark of [false,true]){doc.body.toggleAttribute('data-ds-dark-theme',dark);for(const mode of ['light','dark','enterprise','openterminal']){root.dataset.workbenchStyle=mode;expect(workbenchFramePresentation(frame)).toEqual({type:'sherlock-workbench-style',mode,controlTheme:['dark','openterminal'].includes(mode)?'dark':'light'})}expect(workbenchFramePresentation(doc.querySelector('#global'))).toEqual({type:'sherlock-workbench-style',mode:dark?'dark':'light',controlTheme:dark?'dark':'light'})}
})
it('画布展示仍保留既有全局控件模式，不借本地组件修复改变画布语义',()=>{const w=new Window(),doc=w.document;doc.body.setAttribute('data-ds-dark-theme','');doc.body.innerHTML='<main data-ework-grid data-workbench-style="light"><iframe></iframe></main>';expect(workbenchFramePresentation(doc.querySelector('iframe'))).toEqual({type:'sherlock-workbench-style',mode:'light',controlTheme:'dark'})})


it('仅从原始需求识别明确的主题选择，否定与单纯提到品牌不改变主题',()=>{
 expect(workbenchRequestedStyle('给新同事做速查台，用易方达模式。')).toBe('enterprise')
 expect(workbenchRequestedStyle('不要用深色模式，改用浅色模式')).toBe('light')
 expect(workbenchRequestedStyle('不要用易方达模式')).toBeNull()
 expect(workbenchRequestedStyle('研究易方达公司的组织架构')).toBeNull()
})
