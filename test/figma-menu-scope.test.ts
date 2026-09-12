import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { Window } from 'happy-dom'
import { expect, it, vi } from 'vitest'
import { patchFigmaMenuScope } from '../scripts/lib/figma-menu-scope.mjs'

it('keeps portaled settings menus within the modal and other menus on the document', async () => {
  const require = createRequire(import.meta.url)
  const React = require('react'), jsx = require('react/jsx-runtime')
  const {createRoot} = require('react-dom/client'), {createPortal} = require('react-dom')
  const win = new Window()
  for (const key of ['window','document','Node','HTMLElement','Event'] as const) vi.stubGlobal(key,key === 'window' ? win : win[key])
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true)
  const raw = readFileSync('node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/index.js','utf8')
  const source = patchFigmaMenuScope(raw)
  expect(patchFigmaMenuScope(source)).toBe(source)
  const start = source.indexOf('function Menu('), end = source.indexOf('\n//#endregion',start)
  const bindings = {...React,...jsx,createPortal,clsx:(...values:unknown[])=>values.filter(Boolean).join(' '),
    Menu_module_css_default:new Proxy({}, {get:(_,key)=>String(key)}),MEASURE_STYLE:{},
    usePointerGrace:()=>({arm:()=>{},cancel:()=>{}}),isSeparator:(x:{type?:string})=>x.type==='separator',isLabel:(x:{type?:string})=>x.type==='label',IconCheckOutline16:()=>null}
  const Menu = new Function(...Object.keys(bindings),source.slice(start,end)+'\nreturn Menu;')(...Object.values(bindings))
  const host=win.document.createElement('div');win.document.body.append(host);const root=createRoot(host)
  const props={open:true,portal:true,anchor:jsx.jsx('button',{children:'Options'}),items:[{id:'one',label:'One'}],onSelect:()=>{},onClose:()=>{}}
  try {
    await React.act(async()=>root.render(jsx.jsx('div',{'aria-modal':'true',role:'dialog',children:jsx.jsx(Menu,props)})))
    expect(win.document.querySelector('[role=dialog] [role=menu]')).not.toBeNull()
    expect(win.document.querySelector('body>[role=menu]')).toBeNull()
    await React.act(async()=>root.render(jsx.jsx(Menu,props)))
    expect(win.document.querySelector('body>[role=menu]')).not.toBeNull()
  } finally {await React.act(async()=>root.unmount());vi.unstubAllGlobals();await win.happyDOM.close()}
})
