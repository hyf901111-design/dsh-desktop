import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { afterEach, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import { patchFigmaFinalCanvas } from '../scripts/lib/figma-canvas-client.mjs'
import { patchFigmaDerivedMenu, derivedMenuCss, researchDerivedFloatingPlacement } from '../scripts/lib/figma-derived-menu-client.mjs'

const requireModule=createRequire(import.meta.url), React=requireModule('react')
const original=patchFigmaFinalCanvas(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
const source=patchFigmaDerivedMenu(original)
const start=source.indexOf('/* SHERLOCK_FIGMA_DERIVED_MENU_START */'),end=source.indexOf('/* SHERLOCK_FIGMA_DERIVED_MENU_END */',start)
const components=new Function('react','react_jsx_runtime',source.slice(start,end)+'\nreturn {ResearchDerivedDetailMenu,ResearchDerivedCreatePopover,researchDerivedIsComposing}')(React,requireModule('react/jsx-runtime'))
const cleanups:Array<()=>Promise<void>>=[]
afterEach(async()=>{for(const done of cleanups.splice(0))await done();vi.unstubAllGlobals()})
async function mount(kind:'menu'|'create',extra:Record<string,unknown>={}) {
  const w=new Window({url:'http://localhost/'});vi.stubGlobal('document',w.document);vi.stubGlobal('window',w);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true)
  const {createRoot}=requireModule('react-dom/client')
  const host=w.document.createElement('div');w.document.body.append(host)
  const style=w.document.createElement('style');style.textContent=derivedMenuCss;w.document.head.append(style)
  const trigger=w.document.createElement('button');trigger.setAttribute('aria-label','思维导图');host.append(trigger)
  const root=createRoot(host.appendChild(w.document.createElement('div')))
  const props:any={rootRef:{current:host},anchorRef:{current:host},triggerRef:{current:trigger},popoverRef:{current:null},inputRef:{current:null},canvasSize:{width:900,availableWidth:620,height:700},onClose:vi.fn(),onSelect:vi.fn(),onSubmit:vi.fn(),onPrompt:vi.fn(),selection:{ids:['frozen-a','frozen-b']},prompt:'比较两份资料',error:null,preparing:false,maxPrompt:800,maxSources:24,disabled:false,options:[{value:'brief',label:'简要',description:'保留核心主题'},{value:'standard',label:'常规',description:'覆盖重点与主要关系'},{value:'detailed',label:'详细',description:'展开细节与依据'}],...extra}
  const render=async(next:Record<string,unknown>={})=>{Object.assign(props,next);await React.act(async()=>root.render(React.createElement(kind==='menu'?components.ResearchDerivedDetailMenu:components.ResearchDerivedCreatePopover,props)))}
  cleanups.push(async()=>{await React.act(async()=>root.unmount());await w.happyDOM.abort()});await render()
  return{w,host,props,render}
}
it('replaces the real canvas call sites, compiles and is idempotent for installed and fresh helper entry',()=>{
  expect(source).toContain('(ResearchDerivedDetailMenu, {');expect(source).toContain('(ResearchDerivedCreatePopover, {')
  expect(()=>new Function(source)).not.toThrow();expect(patchFigmaDerivedMenu(source)).toBe(source)
  expect(patchFigmaDerivedMenu(patchFigmaFinalCanvas(source))).toBe(source)
})
it('fails closed on changed renderer or installed helper contracts',()=>{
  const changed=original.includes('/* SHERLOCK_FIGMA_DERIVED_MENU_START */')?original.replace("className: 'rScV5Q_mindMapMenu odyssey-derived-detail-menu'", "className: 'changedMenu'"):original.replace('className: "rScV5Q_mindMapMenu"','className: "changedMenu"')
  expect(()=>patchFigmaDerivedMenu(changed)).toThrow(/derived menu/i)
  expect(()=>patchFigmaDerivedMenu(source.replace('canvasSize: snapshot.canvasSize, onSelect:', 'canvasSize: alteredSize, onSelect:'))).toThrow(/derived menu/i)
})
it('positions the measured menu eight pixels below its trigger within the available canvas width',()=>{
  const p=researchDerivedFloatingPlacement({trigger:{left:510,top:100,right:590,bottom:128},popup:{width:270,height:192},bounds:{left:100,top:20,right:700,bottom:720},parent:{left:450,top:94}})
  expect(p).toMatchObject({left:-28,top:42,maxWidth:584,maxHeight:576,side:'below'})
})
it('opens above when the actual 192px menu cannot fit below and scrolls in a short viewport',()=>{
  const p=researchDerivedFloatingPlacement({trigger:{left:40,top:350,right:130,bottom:378},popup:{width:270,height:192},bounds:{left:0,top:0,right:400,bottom:400},parent:{left:30,top:346}})
  expect(p.top+346+192).toBe(342);expect(p.side).toBe('above')
  const small=researchDerivedFloatingPlacement({trigger:{left:40,top:90,right:130,bottom:118},popup:{width:270,height:192},bounds:{left:0,top:0,right:230,bottom:210},parent:{left:0,top:0}})
  expect(small.maxWidth).toBe(214);expect(small.maxHeight).toBe(76);expect(small.left).toBe(8)
})
it('keeps the default standard selection neutral and sends each real detail value before closing',async()=>{
  const f=await mount('menu'),buttons=[...f.host.querySelectorAll('[data-research-mind-map-detail]')]
  expect(buttons.map(x=>x.getAttribute('aria-checked'))).toEqual(['false','true','false'])
  expect(f.host.querySelectorAll('svg path[stroke-linecap="round"]')).toHaveLength(1)
  for(const button of buttons)await React.act(async()=>button.dispatchEvent(new f.w.MouseEvent('click',{bubbles:true})))
  expect(f.props.onSelect.mock.calls.map((x:any[])=>x[0])).toEqual(['brief','standard','detailed']);expect(f.props.onClose).toHaveBeenCalledTimes(3)
})
it('dismisses the real menu on outside pointerdown and Escape without retaining document listeners after unmount',async()=>{
  const f=await mount('menu')
  await React.act(async()=>f.w.document.body.dispatchEvent(new f.w.PointerEvent('pointerdown',{bubbles:true})))
  await React.act(async()=>f.w.document.body.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true})))
  expect(f.props.onClose).toHaveBeenCalledTimes(2)
  await cleanups.pop()!();f.w.document.body.dispatchEvent(new f.w.PointerEvent('pointerdown',{bubbles:true}));expect(f.props.onClose).toHaveBeenCalledTimes(2)
})
it('renders the visible creation shortcut, count and complete disabled conditions without altering frozen sources',async()=>{
  const selection=Object.freeze({ids:Object.freeze(['source-a','source-b'])}),f=await mount('create',{selection,prompt:''})
  expect(f.host.querySelector('[data-research-create-shortcut]')?.textContent).toBe('⌘ Enter 创建');expect(f.host.querySelector('.odyssey-create-count')?.textContent).toBe('已选择 2 个组件')
  const button=f.host.querySelector('[data-research-create-submit]') as any;expect(button.disabled).toBe(true)
  await f.render({prompt:'比较资料'});expect(button.disabled).toBe(false)
  await React.act(async()=>button.dispatchEvent(new f.w.MouseEvent('click',{bubbles:true})));expect(f.props.onSubmit).toHaveBeenCalledOnce()
  await f.render({disabled:true});expect(button.disabled).toBe(true);expect(selection.ids).toEqual(['source-a','source-b'])
})
it('submits Cmd/Ctrl+Enter once but leaves composition and repeated keydown untouched',async()=>{
  const f=await mount('create'),input=f.host.querySelector('textarea')!
  const key=async(extra:Record<string,unknown>)=>React.act(async()=>input.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true,metaKey:true,...extra})))
  await key({isComposing:true});await key({keyCode:229});await key({repeat:true});expect(f.props.onSubmit).not.toHaveBeenCalled()
  await key({});await key({metaKey:false,ctrlKey:true});expect(f.props.onSubmit).toHaveBeenCalledTimes(2)
  await React.act(async()=>input.dispatchEvent(new f.w.CompositionEvent('compositionstart',{bubbles:true})));await key({});expect(f.props.onSubmit).toHaveBeenCalledTimes(2)
  expect(components.researchDerivedIsComposing({target:input,key:'Escape'})).toBe(true)
  await React.act(async()=>input.dispatchEvent(new f.w.CompositionEvent('compositionend',{bubbles:true})));await key({key:'Escape'});expect(f.props.onClose).toHaveBeenCalledOnce()
})
it('uses exact Figma sizing and material rules, with growing error content instead of fixed dialog height',async()=>{
  const f=await mount('create',{error:'读取失败，已保留资料。'}),dialog=f.host.querySelector('[data-research-create-popover]')!,input=f.host.querySelector('textarea')!
  const d=f.w.getComputedStyle(dialog),i=f.w.getComputedStyle(input)
  expect(d.padding).toBe('22px');expect(d.gap).toBe('12px');expect(d.borderTopWidth).toBe('0px');expect(d.height).not.toBe('261px');expect(i.height).toBe('110px');expect(i.padding).toBe('10px 12px')
  expect(f.host.querySelector('[role=alert]')?.textContent).toContain('已保留资料')
  expect(derivedMenuCss).toContain('rgba(0,0,0,.055)');expect(derivedMenuCss).toContain('rgba(0,0,0,.16)');expect(derivedMenuCss).toContain('#92b5fa')
})
