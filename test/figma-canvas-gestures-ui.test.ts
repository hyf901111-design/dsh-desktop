import { patchCanvasCreationTools } from '../scripts/lib/canvas-creation-tools.mjs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { Window } from 'happy-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { validateCanvas } from '../packages/dsh-research-collaboration/document.js'

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
  const source = patchCanvasCreationTools(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8'))
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
  it('keeps wheel input inside selected interactive content and expanded readers', async () => {
    const m = await mounted()
    await act(async () => { m.workspace.setArtifacts([textNode()]); m.workspace.updateSelection(['source'], 'replace') })
    const body = m.query('[data-research-preview-interactive]')
    const before = { ...m.workspace.getSnapshot().viewport }
    const wheel = {deltaX:10,deltaY:40,clientX:350,clientY:350,metaKey:false,ctrlKey:false}
    const event = await m.event('wheel', body, wheel)
    expect(event.defaultPrevented).toBe(false)
    expect(m.workspace.getSnapshot().viewport).toEqual(before)
    m.query('[data-research-compact-chrome]').setAttribute('open', '')
    const panned = { ...m.workspace.getSnapshot().viewport }
    const readerWheel = await m.event('wheel', body, wheel)
    expect(readerWheel.defaultPrevented).toBe(false)
    expect(m.workspace.getSnapshot().viewport).toEqual(panned)
  })
  it('disables canvas creation controls when a shared board is read only', async () => {
    const m = await mounted({researchBoards:{isSharedSession:()=>true}}, undefined, {disabled:false})
    expect(m.query('[data-research-global-link]').disabled).toBe(true)
    expect(m.query('[data-research-global-container]').disabled).toBe(true)
    expect([...m.host.querySelectorAll('[data-research-global-toolbar] button:not([data-research-global-select])')].every((b:any)=>b.disabled)).toBe(true)
  })
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
    expect(() => validateCanvas({files:[],artifacts:m.workspace.getSnapshot().artifacts})).not.toThrow()
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
    expect(() => validateCanvas({files:[],artifacts:[n]})).not.toThrow()
    expect(m.canvas.getAttribute('data-research-resize-corner')).toBe('nw')
    await m.event('pointercancel',m.canvas,{pointerId:1})
    expect(m.workspace.getSnapshot().artifacts[0]).toMatchObject({x:200,y:200,width:600,height:360})
    expect(m.canvas.hasAttribute('data-research-resize-corner')).toBe(false)
  })
})

it('draws manually sized components in zoomed world coordinates, returns to selection and cancels incomplete drags', async () => {
  const m = await mounted({}, undefined, { disabled: false })
  await act(async () => m.workspace.setViewport({ x: 100, y: 40, scale: 0.5 }))
  await m.event('click', m.query('[data-research-global-container]'))
  await m.event('pointerdown', m.canvas, { button: 0, pointerId: 1, clientX: 250, clientY: 200 })
  await m.event('pointermove', m.canvas, { pointerId: 1, clientX: 650, clientY: 450 })
  expect(m.query('[data-research-component-marquee]').textContent).toBe('智能组件')
  expect(m.query('[data-research-component-marquee]').querySelectorAll('[data-frame-corner]')).toHaveLength(4)
  await m.event('pointerup', m.canvas, { pointerId: 1 })
  expect(m.win.document.activeElement).toBe(m.canvas)
  await m.event('keydown', m.canvas, { code: 'Space', key: ' ' })
  await m.event('pointerdown', m.canvas, { button: 0, pointerId: 4, clientX: 300, clientY: 200 })
  expect(m.canvas.getAttribute('data-research-operation')).toBe('pan')
  await m.event('pointerup', m.canvas, { pointerId: 4 })
  await m.event('keyup', m.canvas, { code: 'Space', key: ' ' })
  const first = m.workspace.getSnapshot().artifacts[0]
  expect(first).toMatchObject({ width: 800, height: 500, x: 600, y: 450, sizeMode: 'manual', generationStatus: 'draft' })
  expect(m.query('[data-research-global-select]').getAttribute('aria-pressed')).toBe('true')
  await m.event('click', m.query('[data-research-global-container]'))
  await m.event('pointerdown', m.canvas, { button: 0, pointerId: 2, clientX: 350, clientY: 250 })
  await m.event('pointerup', m.canvas, { pointerId: 2 })
  const small = m.workspace.getSnapshot().artifacts[1]
  expect(small).toMatchObject({ width: 320, height: 220, x: 560, y: 410 })
  await m.event('click', m.query('[data-research-global-container]'))
  await m.event('pointerdown', m.canvas, { button: 0, pointerId: 3, clientX: 450, clientY: 350 })
  await m.event('pointercancel', m.canvas, { pointerId: 3 })
  expect(m.workspace.getSnapshot().artifacts).toHaveLength(2)
  await m.event('click', m.query('[data-research-global-select]'))
  expect(m.canvas.getAttribute('data-canvas-tool')).toBe('select')
})
it('opens the link editor at the canvas center without changing the selected tool', async () => {
  const m = await mounted({}, undefined, { disabled: false })
  await m.event('click', m.query('[data-research-global-container]'))
  await m.event('click', m.query('[data-research-global-link]'))
  const draft = m.win.document.querySelector('[data-research-link-popover]')!
  expect(draft.parentElement).toBe(m.canvas)
  expect(draft.querySelector('.odyssey-link-title')?.textContent).toBe('链接组件')
  expect(m.canvas.getAttribute('data-canvas-tool')).toBe('component')
  expect((draft as any).style.left).toBe('500px')
  expect((draft as any).style.top).toBe('350px')
  await act(async () => m.workspace.setViewport({ x: 100, y: 40, scale: 2 }))
  expect((draft as any).style.left).toBe('1100px')
  expect((draft as any).style.top).toBe('740px')
  expect((draft as any).style.position).toBe('absolute')
  expect((draft as any).style.transform).toContain('scale(2)')
  const title = draft.querySelector('.odyssey-link-title')!
  await m.event('pointerdown', title, { button: 0, pointerId: 8, clientX: 200, clientY: 200 })
  await m.event('pointermove', title, { pointerId: 8, clientX: 280, clientY: 240 })
  await m.event('pointerup', title, { pointerId: 8 })
  expect((draft as any).style.left).toBe('1180px')
  const input = draft.querySelector('input')! as any
  input.value = 'https://example.com'
  await m.event('input', input)
  await m.event('click', draft.querySelector('[data-research-link-submit]'))
  expect(m.workspace.getSnapshot().artifacts[0]).toMatchObject({ kind: 'web-link', url: 'https://example.com/' })
  expect(m.win.document.querySelector('[data-research-link-popover]')).toBeNull()
})
