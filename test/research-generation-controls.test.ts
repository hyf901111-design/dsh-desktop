import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { Window } from 'happy-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { patchFigmaFinalCanvas, canvasCss } from '../scripts/lib/figma-canvas-client.mjs'
// @ts-expect-error Runtime bundle patcher is a JavaScript build script.
import { patchResearchCreationProgress } from '../scripts/lib/research-creation-progress.mjs'
import { stripConversationGridOverlays } from './fixtures/strip-conversation-transient-ui.mjs'

import {restoreResearchGridWorkbench} from '../scripts/lib/research-grid-workbench.mjs'

const require=createRequire(import.meta.url), React=require('react'),{createRoot}=require('react-dom/client')
const {stripHomeGuideNative}=require('../scripts/lib/home-guide-native.mjs'),{stripHomeGuidePresentationNative}=require('../scripts/lib/home-guide-presentation-native.mjs')
const native=stripHomeGuideNative(stripHomeGuidePresentationNative(stripConversationGridOverlays(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))))
const source=patchResearchCreationProgress(patchFigmaFinalCanvas(restoreResearchGridWorkbench(native)))
const start=source.indexOf('function researchGenerationPresentation('),end=source.indexOf('function isResearchWechatArticleUrl(',start)
const derivedStart=source.indexOf('function researchIsDerivedNode('),derivedEnd=source.indexOf('function researchDerivedTitle(',derivedStart)
const Process=new Function('react','react_jsx_runtime',source.slice(derivedStart,derivedEnd)+source.slice(start,end)+'\nreturn ResearchGenerationProcess')(React,require('react/jsx-runtime'))
const cleanups:Array<()=>Promise<void>>=[]
afterEach(async()=>{for(const cleanup of cleanups.splice(0).reverse())await cleanup();vi.unstubAllGlobals();vi.useRealTimers()})
async function mount(status:string,callbacks:any={}) {
  const win=new Window({url:'https://sherlock.local/'});vi.stubGlobal('window',win);vi.stubGlobal('document',win.document);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true)
  const host=win.document.createElement('div');host.setAttribute('data-research-compact-chrome','');win.document.body.append(host)
  const style=win.document.createElement('style');style.textContent=canvasCss;win.document.head.append(style)
  const root=createRoot(host),node={id:'manual',kind:'generated-container',title:'基金筛选与比较',containerPrompt:'筛选基金',width:240,height:620,x:120,y:310,sizeMode:'manual',generationStatus:status,generationTaskId:'task',generationChildSessionId:'child-task',generationEvents:[],generationStartedAt:Date.now()-18000}
  const render=async(generationStatus=status)=>{await React.act(async()=>root.render(React.createElement(Process,{node:{...node,generationStatus},...callbacks})))}
  cleanups.push(async()=>{await React.act(async()=>root.unmount());await win.happyDOM.abort()})
  await render()
  const click=async(element:any)=>{await React.act(async()=>{element.dispatchEvent(new win.MouseEvent('click',{bubbles:true}));await Promise.resolve()})}
  return{win,host,node,render,click,query:(selector:string)=>host.querySelector(selector) as any}
}
it.each([
  ['running','running'],['retrying','running'],['queued','paused'],['cancelled','paused'],['failed','paused'],['interrupted','paused'],['paused','paused']
])('moves only the square background grid while %s and keeps the foreground stable',async(status,motion)=>{
  const m=await mount(status,{onCancel:()=>true,onRetry:()=>true})
  const background=m.query('[data-research-generation-grid]')
  expect(background).not.toBeNull()
  expect(background.getAttribute('data-grid-moving')).toBe(motion==='running'?'true':'false');expect(background.getAttribute('data-grid-size')).toBe('34')
  expect(m.win.getComputedStyle(m.query('[data-research-generation-foreground]')).transform).toBe('')
  expect(m.query('[data-research-generation-process]').getAttribute('aria-busy')).toBe(['running','retrying','queued'].includes(status)?'true':'false')
})
it.each([
  ['running','停止生成','onCancel'],['failed','重试生成','onRetry'],['cancelled','重新生成','onRetry'],['interrupted','重新生成','onRetry']
])('uses the correct action and an accessible bottom action while %s',async(status,label,callback)=>{
  const action=vi.fn(()=>true),m=await mount(status,{[callback]:action})
  const button=m.query('button[aria-label="'+label+'"]')
  expect(button).not.toBeNull();expect(m.win.getComputedStyle(button).minWidth).toBe('56px');expect(m.win.getComputedStyle(button).height).toBe('28px');expect(button.textContent).toBe(label==='停止生成'?'停止':label==='重试生成'?'重试':'重新生成')
  const tooltip=m.win.document.getElementById(button.getAttribute('aria-describedby')) as any;expect(tooltip?.textContent).toBe(label)
  expect(button.getAttribute('aria-describedby')).toBe(tooltip.id)
  expect(m.win.getComputedStyle(tooltip).visibility).toBe('hidden')
  await React.act(async()=>button.focus())
  expect(m.win.document.getElementById(tooltip.id)).toBe(tooltip)
  await m.render()
  expect(m.win.document.getElementById(tooltip.id)).toBe(tooltip)
  await React.act(async()=>button.dispatchEvent(new m.win.KeyboardEvent('keydown',{key:'Escape',bubbles:true})))
  expect(m.win.document.getElementById(tooltip.id)).toBe(tooltip)
  expect(tooltip.hasAttribute('data-visible')).toBe(false)
  await m.click(button);expect(action).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({id:'manual',width:240,height:620,sizeMode:'manual'}))
})
it('keeps stop pending until inspection returns a terminal state and can recover from a rejected request',async()=>{
  let resolve!:(value:any)=>void,reject!:(reason:any)=>void
  const onCancel=vi.fn(()=>new Promise((yes,no)=>{resolve=yes;reject=no})),m=await mount('running',{onCancel})
  await m.click(m.query('[aria-label="停止生成"]'))
  expect(m.query('[data-research-generation-process]').getAttribute('data-generation-ui-state')).toBe('stopping')
  expect(m.query('[aria-label="停止生成"]')).toBeNull();expect(m.host.textContent).not.toContain('已停止生成')
  await React.act(async()=>reject(new Error('断线')))
  expect(m.query('[role="alert"]').textContent).toContain('停止请求未完成')
  await m.click(m.query('[aria-label="停止生成"]'))
  await React.act(async()=>resolve({ok:true}))
  expect(m.query('[data-research-generation-process]').getAttribute('data-generation-ui-state')).toBe('stopping')
  await m.render('cancelled')
  expect(m.query('[data-research-generation-process]').getAttribute('data-generation-ui-state')).toBe('stopped')
})
it('opens the matching child in the right panel without inline records or resizing',async()=>{
  const onProcess=vi.fn(),onExpand=vi.fn(),m=await mount('running',{onProcess,onExpand})
  const before=JSON.stringify(m.node);onExpand.mockClear();await m.click(m.query('[aria-label="查看过程"]'))
  expect(onProcess).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({id:'manual'}))
  expect(m.query('[data-research-generation-records]')).toBeNull()
  expect(m.win.getComputedStyle(m.query('[data-research-generation-foreground]')).visibility).not.toBe('hidden')
  expect(onExpand).not.toHaveBeenCalled();expect(JSON.stringify(m.node)).toBe(before)
})
it('does not claim resume support without an existing resume capability',async()=>{
  const m=await mount('paused');expect(m.query('[aria-label="继续生成"]')).toBeNull()
})
it('shows total waiting time while keeping the grid paused',async()=>{
  const m=await mount('queued')
  const before=m.query('[data-research-generation-elapsed]').textContent
  expect(before).toMatch(/^00:(?:18|19)$/)
  await React.act(async()=>{await new Promise(resolve=>setTimeout(resolve,1100))})
  const after=m.query('[data-research-generation-elapsed]').textContent
  expect(Number(after.slice(-2))).toBeGreaterThan(Number(before.slice(-2)))
  expect(m.query('[data-research-generation-grid]').getAttribute('data-grid-moving')).toBe('false')
})

it('renders the square grid on an isolated canvas without dots or a gloss sweep',async()=>{
  const m=await mount('queued')
  const dots=m.query('[data-research-generation-grid]')
  expect(dots.tagName).toBe('CANVAS')
  expect(dots.getAttribute('aria-hidden')).toBe('true');expect(m.query('[data-research-generation-gloss]')).toBeNull()
  expect(m.win.getComputedStyle(dots).getPropertyValue('mask-image')).not.toContain('linear-gradient')
})

it('advances execution detail only on new public events and freezes after stopping',async()=>{
 vi.useFakeTimers()
 const m=await mount('running');m.node.generationEvents=[{seq:1,type:'tool-started',tool:'web_search',detail:'检索行业资料'},{seq:2,type:'tool-started',tool:'financial_query',detail:'查询指数行情'}] as any
 await m.render();const first=m.query('[data-progress-detail]')?.textContent
 expect(first).toBeTruthy()
 await React.act(async()=>{vi.advanceTimersByTime(600)})
 expect(m.query('[data-progress-detail]')?.textContent).toBe(first)
 ;(m.node.generationEvents as any[]).push({seq:3,type:'tool-started',tool:'内容校验',detail:'正在核对新一批数据'})
 await m.render()
 expect(m.query('[data-progress-detail]')?.textContent).toContain('正在核对新一批数据')
 await m.render('cancelled');expect(m.query('[data-progress-detail]')).not.toBeNull()
 const stopped=m.host.textContent
 await React.act(async()=>{vi.advanceTimersByTime(1800)})
 expect(m.host.textContent).toBe(stopped)
})
