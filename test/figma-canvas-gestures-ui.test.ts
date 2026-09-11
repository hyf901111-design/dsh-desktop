import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { Window } from 'happy-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

const requireModule = createRequire(import.meta.url)
const react = requireModule('react')
const { createElement, act } = react
const { createRoot } = requireModule('react-dom/client')
class Storage {
  values = new Map<string, string>()
  fail = ''
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { if (this.fail && key.includes(this.fail)) return false; this.values.set(key, value); return true }
}
function fakeModule(): any {
  const fake: any = new Proxy(function () {}, { get: () => fake, apply: () => fake, construct: () => ({}) })
  return fake
}
async function fixture(desktop: any = {}, win?: Window) {
  let descriptor: any
  const window: any = win ?? {}
  Object.assign(window, { dshDesktop: desktop, __ModuleLoader__: { load: (value: any) => { descriptor = value } } })
  const source = await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')
  runInNewContext(source, { window, document: win?.document, localStorage: win?.localStorage, navigator: win?.navigator, HTMLElement: win?.HTMLElement, HTMLTextAreaElement: win?.HTMLTextAreaElement, Text: win?.Text, ResizeObserver: win?.ResizeObserver, requestAnimationFrame: win?.requestAnimationFrame.bind(win), cancelAnimationFrame: win?.cancelAnimationFrame.bind(win), AbortController, TextDecoder, TextEncoder, setTimeout, clearTimeout })
  const bundle = descriptor.factory((id: string) => {
    if (id === 'react') return react
    if (id === 'react/jsx-runtime') return requireModule(id)
    if (id === 'react-dom') return requireModule(id)
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return new Proxy({ MarkdownText: ({ text }: any) => createElement('div', null, text) }, { get: (target, key) => Reflect.get(target, key) ?? (String(key).startsWith('Icon') ? () => null : fakeModule()) })
    return fakeModule()
  })
  const storage = new Storage()
  return { bundle, storage, workspace: bundle.createResearchWorkspaceSession(storage, 'target') }
}
const textNode = (id = 'source', x = 10, y = 20) => ({ id, kind: 'pasted-text', messageId: id, title: '研究文字', excerpt: '# 事实\n内容', x, y, width: 600, height: 360, sizeMode: 'manual' })
const file = { assetId: 'a'.repeat(48), name: 'report.pdf', mimeType: 'application/pdf', size: 22, previewable: true }
const grant = (nodeId: string) => ({ nodeId, sessionId: 'target', authorizationId: `auth-${nodeId}`, capabilityToken: 'runtime-only', url: 'sherlock-research-file://preview', name: 'report.pdf', contentType: 'application/pdf', path: '/managed/report.pdf' })
const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
async function mounted(desktop: any = {}, configure?: (win: Window) => void, selectionGeneration?: any) {
  const win = new Window({ url: 'https://sherlock.local/' })
  configure?.(win)
  const keys = ['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT']
  const originals = keys.map((key) => Object.getOwnPropertyDescriptor(globalThis, key))
  const globals = [win, win.document, win.navigator, true]
  keys.forEach((key, i) => Object.defineProperty(globalThis, key, { configurable: true, value: globals[i] }))
  const f = await fixture(desktop, win)
  const registry = new f.bundle.ResearchWorkspaceRegistry(f.storage)
  const workspace = registry.for('target')
  const host = win.document.createElement('div'); win.document.body.append(host)
  const root = createRoot(host)
  let unmounted = false
  const render = async (sessionId = 'target') => { await act(async () => root.render(createElement(f.bundle.ResearchCanvas, { sessionId, t: (key: string) => key, researchWorkspaces: registry, selectionGeneration }))) }
  const unmount = async () => { if (!unmounted) { await act(async () => root.unmount()); unmounted = true } }
  cleanups.push(async () => { await unmount(); await win.happyDOM.abort(); keys.forEach((key, i) => { if (originals[i]) Object.defineProperty(globalThis, key, originals[i]!); else delete (globalThis as any)[key] }) })
  await render()
  const canvas = host.querySelector('[data-research-canvas]')! as any
  canvas.getBoundingClientRect = () => ({ left: 50, top: 60, width: 1000, height: 700, right: 1050, bottom: 760 })
  await act(async () => workspace.setCanvasSize({ width: 1000, height: 700 }))
  const event = async (type: string, target: any = canvas, props: any = {}) => {
    const value = new win.Event(type, { bubbles: true, cancelable: true }); Object.defineProperties(value, Object.fromEntries(Object.entries(props).map(([key, value]) => [key, { value }])))
    await act(async () => { target.dispatchEvent(value); await new Promise((resolve) => setTimeout(resolve, 0)) })
    return value
  }
  const query = (selector: string) => host.querySelector(selector) as any
  return { ...f, win, workspace, registry, host, canvas, query, event, render, unmount }
}


describe('Figma canvas pointer transactions', () => {
  it('snaps to neighbouring edges, bypasses with Alt, and cancels without adding undo history', async () => {
    const m = await mounted()
    await act(async () => m.workspace.setArtifacts([textNode('a',200,200),textNode('b',850,600)]))
    const before=m.workspace.getSnapshot().artifacts.map((n:any)=>({id:n.id,x:n.x,y:n.y}))
    const title=m.query('[data-research-node-id="b"] [data-research-node-title]')
    await m.event('pointerdown',title,{button:0,pointerId:1,clientX:850,clientY:600})
    await m.event('pointermove',m.canvas,{pointerId:1,clientX:203,clientY:600,altKey:false})
    expect(m.workspace.getSnapshot().artifacts.find((n:any)=>n.id==='b').x).toBe(200)
    expect(m.query('[data-snap-axis="x"]')).not.toBeNull()
    await m.event('keydown',m.canvas,{key:'Alt',code:'AltLeft',altKey:true})
    expect(m.workspace.getSnapshot().artifacts.find((n:any)=>n.id==='b').x).toBe(203)
    expect(m.query('[data-snap-axis="x"]')).toBeNull()
    await m.event('keyup',m.canvas,{key:'Alt',code:'AltLeft',altKey:false})
    expect(m.workspace.getSnapshot().artifacts.find((n:any)=>n.id==='b').x).toBe(200)
    await m.event('keydown',m.canvas,{key:'Escape',code:'Escape'})
    expect(m.workspace.getSnapshot().artifacts.map((n:any)=>({id:n.id,x:n.x,y:n.y}))).toEqual(before)
    expect(m.query('[data-snap-axis]')).toBeNull()
    await act(async()=>m.workspace.undo())
    expect(m.workspace.getSnapshot().artifacts).toHaveLength(0)
  })
  it('moves multiple selected nodes together and commits exactly one undo step', async()=>{
    const m=await mounted()
    await act(async()=>{m.workspace.setArtifacts([textNode('a',200,200),textNode('b',850,600)]);m.workspace.updateSelection(['a','b'],'replace')})
    const title=m.query('[data-research-node-id="a"] [data-research-node-title]')
    await m.event('pointerdown',title,{button:0,pointerId:1,clientX:200,clientY:200})
    for(const x of [230,270,300]) await m.event('pointermove',m.canvas,{pointerId:1,clientX:x,clientY:220})
    await m.event('pointerup',m.canvas,{pointerId:1})
    expect(m.workspace.getSnapshot().artifacts.map((n:any)=>n.x)).toEqual([300,950])
    await act(async()=>m.workspace.undo())
    expect(m.workspace.getSnapshot().artifacts.map((n:any)=>n.x)).toEqual([200,850])
    await act(async()=>m.workspace.redo())
    expect(m.workspace.getSnapshot().artifacts.map((n:any)=>n.x)).toEqual([300,950])
  })
  it('selects an unselected corner, fixes its opposite corner and clears active handle on cancel',async()=>{
    const m=await mounted()
    await act(async()=>m.workspace.setArtifacts([textNode('a',200,200)]))
    expect(m.host.querySelectorAll('[data-research-resize-handle]')).toHaveLength(4)
    await m.event('pointerdown',m.query('[data-research-resize-handle="nw"]'),{button:0,pointerId:1,clientX:0,clientY:0})
    expect(m.workspace.getSnapshot().selection.selectedNodeIds).toEqual(['a'])
    await m.event('pointermove',m.canvas,{pointerId:1,clientX:-20,clientY:-30,altKey:true})
    const n=m.workspace.getSnapshot().artifacts[0]
    expect(n.x+n.width/2).toBe(500)
    expect(n.y+n.height/2).toBe(380)
    expect(m.canvas.getAttribute('data-research-resize-corner')).toBe('nw')
    await m.event('pointercancel',m.canvas,{pointerId:1})
    expect(m.workspace.getSnapshot().artifacts[0]).toMatchObject({x:200,y:200,width:600,height:360})
    expect(m.canvas.hasAttribute('data-research-resize-corner')).toBe(false)
  })
})
