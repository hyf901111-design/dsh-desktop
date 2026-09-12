import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { Window, DOMRect, type Element, type HTMLInputElement } from 'happy-dom'
import { expect, it, vi } from 'vitest'
import { patchFigmaModelMenu } from '../scripts/lib/figma-model-menu.mjs'

const require = createRequire(import.meta.url)
const react = require('react')
const jsx = require('react/jsx-runtime')
const reactDOM = require('react-dom')
const {createRoot} = require('react-dom/client')

it('opens the searchable model list, filters provider names, selects real IDs and restores focus', async () => {
  const win = new Window()
  for (const key of ['window','document','Node','HTMLElement','Event','CustomEvent'] as const) vi.stubGlobal(key, key === 'window' ? win : win[key])
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true)
  const original = readFileSync('node_modules/@deepseek-ai/dsh-client-ui-model-selection/lib/client.js','utf8')
  const source = patchFigmaModelMenu(original)
  expect(patchFigmaModelMenu(source)).toBe(source)
  const start = source.indexOf('function ModelSelect(')
  const end = source.indexOf('\n\t\t//#endregion',start)
  const ModelSelect = new Function('react','react_jsx_runtime','odysseyReactDOM','ModelSelect_module_css_default','_deepseek_ai_dsh_client_ui_primitives','clsx',source.slice(start,end)+'\nreturn ModelSelect;')(
    react,jsx,reactDOM,new Proxy({}, {get:(_,key)=>'_7KE1Ra_'+String(key)}),new Proxy({}, {get:()=>()=>null}),(...x:unknown[])=>x.filter(Boolean).join(' '))
  const state = {status:'ready',current:{provider:'kimi',model:'k3'},error:null,failures:[],groups:[
    {id:'kimi',name:'Moonshot',models:[{id:'k3',name:'Kimi K3',reasoning:{efforts:[{id:'high',name:'High'}]}}]},
    {id:'other',name:'Other Provider',models:[{id:'second',name:'Second Model'}]}
  ]}
  const directory={subscribe:()=>()=>{},getSnapshot:()=>state}
  const select=vi.fn(async()=>true)
  const host=win.document.createElement('div'); win.document.body.append(host)
  const root=createRoot(host)
  const click=async(el:Element)=>react.act(async()=>el.dispatchEvent(new win.MouseEvent('click',{bubbles:true})))
  try {
    await react.act(async()=>root.render(jsx.jsx(ModelSelect,{locked:false,available:true,directory,load:()=>{},select,t:(key:string)=>key})))
    const trigger=host.querySelector('button')!
    trigger.getBoundingClientRect=()=>new DOMRect(600,200,140,28)
    await click(trigger)
    const search=win.document.querySelector<HTMLInputElement>('input[type=search]')!
    expect(search).not.toBeNull()
    expect(win.document.querySelectorAll('[role=menuitemradio]')).toHaveLength(2)
    await react.act(async()=>{Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype,'value')!.set!.call(search,'moonshot');search.dispatchEvent(new win.Event('input',{bubbles:true}))})
    expect(win.document.querySelectorAll('[role=menuitemradio]')).toHaveLength(1)
    expect(win.document.querySelector('[role=menuitemradio]')?.textContent).toContain('Kimi K3')
    await react.act(async()=>{Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype,'value')!.set!.call(search,'unmatched');search.dispatchEvent(new win.Event('input',{bubbles:true}))})
    expect(win.document.querySelectorAll('[role=menuitemradio]')).toHaveLength(0)
    await react.act(async()=>search.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})))
    expect(win.document.querySelector('[role=menu]')).toBeNull()
    expect(win.document.activeElement).toBe(trigger)
    await click(trigger)
    const choices=win.document.querySelectorAll('[role=menuitemradio]')
    await click(choices[1]!)
    expect(select).toHaveBeenCalledWith({provider:'other',model:'second'})
    expect(win.document.querySelector('[role=menu]')).toBeNull()
    expect(win.document.activeElement).toBe(trigger)
  } finally {await react.act(async()=>root.unmount());vi.unstubAllGlobals();await win.happyDOM.close()}
})
