import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { Window, DOMRect, type Element, type HTMLElement as HappyHTMLElement } from 'happy-dom'
import { expect, it, vi } from 'vitest'
import { patchFigmaModelMenu } from '../scripts/lib/figma-model-menu.mjs'

const require = createRequire(import.meta.url)
const react = require('react')
const jsx = require('react/jsx-runtime')
const reactDOM = require('react-dom')
const {createRoot} = require('react-dom/client')

it('restores the two-level menu and keeps mouse selection alive across null-focus blur', async () => {
  const win = new Window()
  for (const key of ['window','document','Node','HTMLElement','Event','CustomEvent'] as const) vi.stubGlobal(key, key === 'window' ? win : win[key])
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true)
  const source = patchFigmaModelMenu(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-model-selection/lib/client.js','utf8'))
  expect(patchFigmaModelMenu(source)).toBe(source)
  const start=source.indexOf('function ModelSelect('), end=source.indexOf('\n\t\t//#endregion',start)
  const ModelSelect=new Function('react','react_jsx_runtime','odysseyReactDOM','ModelSelect_module_css_default','_deepseek_ai_dsh_client_ui_primitives','clsx',source.slice(start,end)+'\nreturn ModelSelect;')(
    react,jsx,reactDOM,new Proxy({}, {get:(_,key)=>'_7KE1Ra_'+String(key)}),new Proxy({}, {get:()=>()=>null}),(...x:unknown[])=>x.filter(Boolean).join(' '))
  let state={status:'ready',current:{provider:'kimi',model:'k3'},error:null,failures:[],groups:[
    {id:'kimi',name:'Kimi',models:[{id:'k3',name:'Kimi K3',supportsImageInput:true,reasoning:{efforts:[{id:'high',name:'High'}]}}]},
    {id:'other',name:'Other',models:[{id:'k3',name:'Second Model'}]},
    {id:'ework-ark',name:'EWork · 火山方舟',models:[
      {id:'doubao-seed-2.1-lite',name:'Doubao Seed 2.1 Lite',supportsImageInput:true},
      {id:'glm-5.3',name:'GLM 5.3'},
      {id:'deepseek-v4-pro',name:'DeepSeek V4 Pro'},
      {id:'kimi-k3.1-pro',name:'Kimi K3.1 Pro',supportsImageInput:true},
      {id:'deepseek-v4.1-flash',name:'DeepSeek V4.1 Flash',supportsImageInput:true}
    ]}
  ]}
  const listeners=new Set<()=>void>()
  const select=vi.fn(async()=>true),directory={subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>listeners.delete(listener)},getSnapshot:()=>state}
  const updateGroups=async(groups:typeof state.groups)=>react.act(async()=>{
    state={...state,groups}
    for(const listener of listeners)listener()
  })
  const host=win.document.createElement('div');host.className='t8lSSG_panel';host.getBoundingClientRect=()=>new DOMRect(600,0,280,800);win.document.body.append(host);const root=createRoot(host)
  const click=async(el:Element)=>react.act(async()=>{el.dispatchEvent(new win.MouseEvent('mousedown',{bubbles:true,cancelable:true}));el.dispatchEvent(new win.MouseEvent('click',{bubbles:true}))})
  const openModelSettings=vi.fn()
  win.addEventListener('sherlock:model-settings-open',openModelSettings)
  const copy:Record<string,string>={'option.vision':'视觉','group.custom':'自定义模型','action.addCustomModel':'添加自定义模型'}
  const modelMenu=()=>win.document.querySelector('[role=menu]')!
  const showModels=async(trigger:Element)=>{
    await click(trigger)
    await click(modelMenu().querySelector('[role=menuitem]')!)
  }
  try {
    await react.act(async()=>root.render(jsx.jsx(ModelSelect,{locked:false,available:true,directory,load:()=>{},select,t:(key:string)=>copy[key]??key})))
    const trigger=host.querySelector('button')!;trigger.getBoundingClientRect=()=>new DOMRect(700,550,120,28)
    expect(trigger.querySelector('.odyssey-model-vision-tag')?.textContent).toBe('视觉')
    await click(trigger)
    const menu=win.document.querySelector<HappyHTMLElement>('[role=menu]')!;expect(parseFloat(menu.style.left)).toBeGreaterThanOrEqual(612);expect(parseFloat(menu.style.left)+parseFloat(menu.style.width)).toBeLessThanOrEqual(868);expect(parseFloat(menu.style.width)).toBe(256);
    expect(win.document.querySelector('input[type=search]')).toBeNull()
    expect(win.document.querySelector('[role=menu]')?.textContent).toContain('menu.model')
    const model=win.document.querySelector('[role=menuitem]')!
    await click(model)
    const rows = win.document.querySelectorAll('[role=menuitemradio]')
    expect(rows).toHaveLength(2)
    expect(modelMenu().querySelectorAll('[role=group]')).toHaveLength(1)
    expect(modelMenu().querySelector('[role=group]')?.textContent).toContain('自定义模型')
    expect(rows[0]!.getAttribute('aria-checked')).toBe('true')
    expect(rows[1]!.getAttribute('aria-checked')).toBe('false')
    const badge = rows[0]!.querySelector('.odyssey-model-vision-tag')
    expect(badge?.previousElementSibling?.textContent).toBe('Kimi K3')
    expect(badge?.textContent).toBe('视觉')
    expect(rows[1]!.querySelector('.odyssey-model-vision-tag')).toBeNull()
    // macOS can blur the trigger without focusing a button on pointer down.
    await react.act(async()=>trigger.dispatchEvent(new win.FocusEvent('focusout',{bubbles:true,relatedTarget:null})))
    expect(win.document.querySelector('[role=menu]')).not.toBeNull()
    await click(win.document.querySelectorAll('[role=menuitemradio]')[1]!)
    expect(select).toHaveBeenCalledWith({provider:'other',model:'k3'})
    expect(win.document.querySelector('[role=menu]')).toBeNull()
    await click(trigger)
    await click(win.document.querySelectorAll('[role=menuitem]')[1]!)
    const efforts=win.document.querySelectorAll('[role=menuitemradio]')
    await click(efforts[efforts.length-1]!)
    expect(select).toHaveBeenLastCalledWith({provider:'kimi',model:'k3',reasoningEffort:'high'})
    await click(trigger)
    await react.act(async()=>win.document.body.dispatchEvent(new win.MouseEvent('mousedown',{bubbles:true})))
    expect(win.document.querySelector('[role=menu]')).toBeNull()
    await click(trigger)
    await click(win.document.querySelector('[role=menuitem]')!)
    const toggleLogin=async(on:boolean)=>react.act(async()=>{
      win.document.documentElement.toggleAttribute('data-odyssey-hosted-account',on)
      await win.happyDOM.whenAsyncComplete()
    })
    await toggleLogin(true)
    const groups = [...win.document.querySelectorAll('[role=menu] [role=group]')]
    const headings = groups.map(group => win.document.getElementById(group.getAttribute('aria-labelledby')!))
    expect(headings.map(heading => heading?.textContent)).toEqual(['Doubao','Kimi','DeepSeek','GLM','自定义模型'])
    expect(new Set(headings.map(heading => heading?.id)).size).toBe(groups.length)
    const hostedRows = groups.slice(0,-1).flatMap(group => [...group.querySelectorAll('[role=menuitemradio]')])
    expect(hostedRows.map(row => row.querySelector('.odyssey-model-vision-tag')?.textContent ?? null))
      .toEqual(['视觉','视觉',null,'视觉',null])
    await click(hostedRows[3]!)
    expect(select).toHaveBeenLastCalledWith({provider:'ework-ark',model:'deepseek-v4.1-flash'})
    await click(trigger)
    await click(win.document.querySelector('[role=menuitem]')!)
    await toggleLogin(false)
    expect(win.document.querySelector('[role=menu]')?.textContent).not.toContain('Doubao Seed 2.1 Lite')
    // The footer is available without a configured provider or a hosted account.
    await updateGroups([])
    const footer = modelMenu().lastElementChild!
    const add = footer.querySelector('[role=menuitem]')!
    expect(add.textContent).toBe('添加自定义模型')
    await click(add)
    expect(openModelSettings).toHaveBeenCalledTimes(1)
    expect(win.document.querySelector('[role=menu]')).toBeNull()
    // A catalog refresh after saving settings populates the same picker.
    await updateGroups([{id:'new-provider',name:'Example provider',models:[{id:'new-model',name:'新配置的模型'}]}])
    await showModels(trigger)
    expect(modelMenu().querySelector('[role=group]')?.textContent).toBe('自定义模型新配置的模型')
    await click(modelMenu().querySelector('[role=menuitemradio]')!)
    expect(select).toHaveBeenLastCalledWith({provider:'new-provider',model:'new-model'})
  } finally {await react.act(async()=>root.unmount());vi.unstubAllGlobals();await win.happyDOM.close()}
})
