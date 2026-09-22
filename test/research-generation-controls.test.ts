import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { Window } from 'happy-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { patchFigmaFinalCanvas, canvasCss } from '../scripts/lib/figma-canvas-client.mjs'

const require=createRequire(import.meta.url), React=require('react'),{createRoot}=require('react-dom/client')
const source=patchFigmaFinalCanvas(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
const start=source.indexOf('function researchGenerationPresentation('),end=source.indexOf('function isResearchWechatArticleUrl(',start)
const derivedStart=source.indexOf('function researchIsDerivedNode('),derivedEnd=source.indexOf('function researchDerivedTitle(',derivedStart)
const Process=new Function('react','react_jsx_runtime',source.slice(derivedStart,derivedEnd)+source.slice(start,end)+'\nreturn ResearchGenerationProcess')(React,require('react/jsx-runtime'))
const cleanups:Array<()=>Promise<void>>=[]
afterEach(async()=>{for(const cleanup of cleanups.splice(0).reverse())await cleanup();vi.unstubAllGlobals()})
async function mount(status:string,callbacks:any={}) {
  const win=new Window({url:'https://sherlock.local/'});vi.stubGlobal('window',win);vi.stubGlobal('document',win.document);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true)
  const host=win.document.createElement('div');host.setAttribute('data-research-compact-chrome','');win.document.body.append(host)
  const style=win.document.createElement('style');style.textContent=canvasCss;win.document.head.append(style)
  const root=createRoot(host),node={id:'manual',kind:'generated-container',title:'基金筛选与比较',containerPrompt:'筛选基金',width:240,height:620,x:120,y:310,sizeMode:'manual',generationStatus:status,generationTaskId:'task',generationEvents:[],generationStartedAt:Date.now()-18000}
  const render=async(generationStatus=status)=>{await React.act(async()=>root.render(React.createElement(Process,{node:{...node,generationStatus},...callbacks})))}
  cleanups.push(async()=>{await React.act(async()=>root.unmount());await win.happyDOM.abort()})
  await render()
  const click=async(element:any)=>{await React.act(async()=>{element.dispatchEvent(new win.MouseEvent('click',{bubbles:true}));await Promise.resolve()})}
  return{win,host,node,render,click,query:(selector:string)=>host.querySelector(selector) as any}
}
it.each([
  ['running','running'],['retrying','running'],['queued','paused'],['cancelled','paused'],['failed','paused'],['interrupted','paused'],['paused','paused']
])('moves only background dots while %s and keeps the foreground stable',async(status,motion)=>{
  const m=await mount(status,{onCancel:()=>true,onRetry:()=>true})
  const background=m.query('[data-research-generation-dots]')
  expect(background).not.toBeNull()
  expect(m.win.getComputedStyle(background).animationPlayState).toBe(motion)
  expect(m.win.getComputedStyle(m.query('[data-research-generation-foreground]')).transform).toBe('')
  expect(m.query('[data-research-generation-process]').getAttribute('aria-busy')).toBe(['running','retrying','queued'].includes(status)?'true':'false')
})
it.each([
  ['running','停止生成','onCancel'],['failed','重试生成','onRetry'],['cancelled','重新生成','onRetry'],['interrupted','重新生成','onRetry']
])('uses the correct action and an accessible 24px hover icon while %s',async(status,label,callback)=>{
  const action=vi.fn(()=>true),m=await mount(status,{[callback]:action})
  const button=m.query('button[aria-label="'+label+'"]')
  expect(button).not.toBeNull();expect(m.win.getComputedStyle(button).width).toBe('24px');expect(m.win.getComputedStyle(button).height).toBe('24px')
  await React.act(async()=>button.focus())
  const tooltip=m.query('[role="tooltip"]');expect(tooltip?.textContent).toBe(label)
  expect(button.getAttribute('aria-describedby')).toBe(tooltip.id)
  await React.act(async()=>button.dispatchEvent(new m.win.KeyboardEvent('keydown',{key:'Escape',bubbles:true})))
  expect(m.query('[role="tooltip"]')).toBeNull()
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
it('opens real public process records without exposing private reasoning or resizing the frame',async()=>{
  const onExpand=vi.fn(),m=await mount('running',{onExpand})
  const button=m.query('[aria-label="查看过程"]');expect(button).not.toBeNull()
  const before=JSON.stringify(m.node);onExpand.mockClear();await m.click(button)
  expect(m.query('[data-research-generation-records]')).not.toBeNull()
  expect(m.query('[data-research-generation-toggle]').getAttribute('aria-expanded')).toBe('true')
  expect(onExpand).not.toHaveBeenCalled();expect(JSON.stringify(m.node)).toBe(before)
})
it.each(['light','dark'])('isolates expanded records from the underlying foreground in %s mode',async(theme)=>{
  const m=await mount('running')
  m.win.document.body.toggleAttribute('data-ds-dark-theme',theme==='dark')
  await m.click(m.query('[aria-label="查看过程"]'))
  expect(m.win.getComputedStyle(m.query('[data-research-generation-foreground]')).visibility).toBe('hidden')
  expect(m.win.getComputedStyle(m.query('[data-research-generation-records]')).backgroundColor).toBe(theme==='dark'?'#030303':'#fafafa')
  expect(m.query('[data-research-generation-elapsed]')).not.toBeNull()
  await m.click(m.query('[aria-label="收起过程"]'))
  expect(m.win.getComputedStyle(m.query('[data-research-generation-foreground]')).visibility).not.toBe('hidden')
})
it('does not claim resume support without an existing resume capability',async()=>{
  const m=await mount('paused');expect(m.query('[aria-label="继续生成"]')).toBeNull()
})
it('keeps waiting time at 00:00 instead of counting queue time as execution',async()=>{
  const m=await mount('queued')
  expect(m.query('[data-research-generation-elapsed]').textContent).toBe('00:00')
  const initial=Date.now();vi.spyOn(Date,'now').mockReturnValue(initial+20000)
  try { await m.render('queued');expect(m.query('[data-research-generation-elapsed]').textContent).toBe('00:00') }
  finally {vi.restoreAllMocks()}
})
