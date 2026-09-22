import { patchCanvasCreationTools } from '../scripts/lib/canvas-creation-tools.mjs'
import { patchFigmaFinalCanvas } from '../scripts/lib/figma-canvas-client.mjs'
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
  const source = patchCanvasCreationTools(patchFigmaFinalCanvas(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')))
  runInNewContext(source, { window, document: win?.document, localStorage: win?.localStorage, navigator: win?.navigator, HTMLElement: win?.HTMLElement, HTMLTextAreaElement: win?.HTMLTextAreaElement, Text: win?.Text, ResizeObserver: win?.ResizeObserver, requestAnimationFrame: win?.requestAnimationFrame.bind(win), cancelAnimationFrame: win?.cancelAnimationFrame.bind(win), AbortController, TextDecoder, TextEncoder, setTimeout, clearTimeout, setInterval, clearInterval })
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
it.each([[240,620],[360,200]])('keeps a manually drawn %s × %s frame through generation, retry and completion', async (width,height) => {
  const m=await mounted({},undefined,{disabled:false})
  await act(async()=>m.workspace.setViewport({x:100,y:40,scale:.5}))
  await m.event('click',m.query('[data-research-global-container]'))
  await m.event('pointerdown',m.canvas,{button:0,pointerId:1,clientX:250,clientY:200})
  await m.event('pointermove',m.canvas,{pointerId:1,clientX:250+width*.5,clientY:200+height*.5})
  await m.event('pointerup',m.canvas,{pointerId:1})
  const node=m.workspace.getSnapshot().artifacts[0]
  const geometry={x:200+width/2,y:200+height/2,width,height,sizeMode:'manual'}
  expect(node).toMatchObject(geometry)
  for(const state of ['failed','cancelled','interrupted']) {
    await act(async()=>{
      m.workspace.beginContainerGeneration(node.id,'生成实际研究内容')
      m.workspace.attachGenerationTask(node.id,{taskId:state,canvasNodeId:node.id,state:'running',lastSeq:0})
      m.workspace.applyGenerationInspection(node.id,{taskId:state,canvasNodeId:node.id,state,lastSeq:1,events:[],error:'fixture'})
    })
    expect(m.workspace.getSnapshot().artifacts[0]).toMatchObject({...geometry,generationStatus:state})
    await act(async()=>{expect(m.workspace.retryGeneration(node.id)).not.toBeNull()})
    expect(m.workspace.getSnapshot().artifacts[0]).toMatchObject({...geometry,generationStatus:'queued'})
  }
  await act(async()=>{
    m.workspace.attachGenerationTask(node.id,{taskId:'finished',canvasNodeId:node.id,state:'running',lastSeq:0})
    m.workspace.applyGenerationInspection(node.id,{taskId:'finished',canvasNodeId:node.id,state:'completed',lastSeq:1,events:[],finalOutput:JSON.stringify({version:1,type:'markdown',title:'研究内容',content:'# 内容\n完成'})})
  })
  expect(m.workspace.getSnapshot().artifacts[0]).toMatchObject({...geometry,generationStatus:'completed'})
})

it.each([['Enter',{}],['Cmd+Enter',{metaKey:true}],['Ctrl+Enter',{ctrlKey:true}]])('submits the manual composer with %s without changing world bounds',async(_label,modifiers)=>{
  const generate=vi.fn(async()=>({ok:true})),m=await mounted({},undefined,{disabled:false,generate})
  const geometry={x:320,y:450,width:240,height:620,sizeMode:'manual'}
  await act(async()=>{m.workspace.createContainerDraft(geometry)})
  const input=m.query('[data-research-container-prompt]')
  await act(async()=>input.focus())
  input.value='整理基金比较';await m.event('input',input)
  const event=await m.event('keydown',input,{key:'Enter',...modifiers})
  expect(event.defaultPrevented).toBe(true);expect(generate).toHaveBeenCalledTimes(1)
  expect(m.workspace.getSnapshot().artifacts[0]).toMatchObject({...geometry,generationStatus:'queued'})
})
it('leaves Shift+Enter to the textarea and ignores IME confirmation and empty manual prompts',async()=>{
  const generate=vi.fn(async()=>({ok:true})),m=await mounted({},undefined,{disabled:false,generate})
  await act(async()=>{m.workspace.createContainerDraft({x:320,y:450,width:240,height:620,sizeMode:'manual'})})
  const input=m.query('[data-research-container-prompt]')
  await act(async()=>input.focus())
  await m.event('keydown',input,{key:'Enter'});expect(generate).not.toHaveBeenCalled()
  input.value='基金比较';await m.event('input',input)
  for(const modifiers of [{shiftKey:true},{isComposing:true},{metaKey:true,isComposing:true},{ctrlKey:true,keyCode:229}]){
    const event=await m.event('keydown',input,{key:'Enter',...modifiers})
    expect(event.defaultPrevented).toBe(false);expect(generate).not.toHaveBeenCalled()
  }
  expect(m.workspace.getSnapshot().artifacts[0].generationStatus).toBe('draft')
})

it.each(['failed','cancelled'])('keeps the real public process available after %s inspection',async(state)=>{
  const m=await mounted({},undefined,{disabled:false})
  let node:any
  await act(async()=>{
    node=m.workspace.createContainerDraft({x:300,y:200,width:360,height:200,sizeMode:'manual'})
    m.workspace.beginContainerGeneration(node.id,'比较基金')
    m.workspace.attachGenerationTask(node.id,{taskId:'history',canvasNodeId:node.id,state:'running',lastSeq:1,events:[{taskId:'history',canvasNodeId:node.id,seq:1,type:'tool-started',tool:'资料核对',detail:'已经核对真实基金来源 token=fixture-private /Users/private/report.txt'}]})
    m.workspace.applyGenerationInspection(node.id,{taskId:'history',canvasNodeId:node.id,state,lastSeq:2,events:[],error:'数据源响应超时'})
  })
  await m.event('click',m.query('[data-research-generation-toggle]'))
  expect(m.query('[data-research-generation-records]').textContent).toContain('已经核对真实基金来源')
  expect(JSON.stringify(m.workspace.getSnapshot().artifacts[0].generationEvents)).not.toContain('fixture-private')
  expect(m.query('[data-research-generation-records]').textContent).not.toContain('/Users/private')
})

it('treats link drafts as native nodes for marquee, dragging, layout and in-place creation', async () => {
  const m = await mounted({}, undefined, { disabled: false })
  await m.event('click', m.query('[data-research-global-link]'))
  const draft = m.query('[data-research-link-draft]')
  const id = draft.getAttribute('data-research-node-id')
  expect(draft.closest('[data-research-content-layer]')).not.toBeNull()
  expect(draft.textContent).toContain('添加链接')
  expect(draft.querySelector('[data-research-container-expand]')).not.toBeNull()
  expect(draft.querySelector('[data-research-frame-more]')).not.toBeNull()
  expect(m.query('[data-research-selection-actions]')).toBeNull()
  expect(m.workspace.getSnapshot().artifacts[0]).toMatchObject({id,title:'添加链接',x:500,y:350,width:400,height:177})
  await m.event('pointerdown',m.canvas,{button:0,pointerId:1,clientX:250,clientY:250})
  await m.event('pointermove',m.canvas,{pointerId:1,clientX:800,clientY:550})
  expect(m.query('[data-research-marquee]')).not.toBeNull()
  await m.event('pointerup',m.canvas,{pointerId:1})
  expect(m.workspace.getSnapshot().selection.selectedNodeIds).toContain(id)
  expect(draft.getAttribute('data-selected')).toBe('true')
  const title=draft.querySelector('[data-research-node-move-handle]')
  await m.event('pointerdown',title,{button:0,pointerId:2,clientX:400,clientY:350})
  await m.event('pointermove',m.canvas,{pointerId:2,clientX:480,clientY:390})
  await m.event('pointerup',m.canvas,{pointerId:2})
  expect(m.workspace.getSnapshot().artifacts[0]).toMatchObject({x:580,y:390})
  await act(async()=>{m.workspace.createContainerDraft({x:580,y:390,width:400,height:300,sizeMode:'manual'});m.workspace.organizeCanvas()})
  const nodes=m.workspace.getSnapshot().artifacts, link=nodes.find((n:any)=>n.id===id), other=nodes.find((n:any)=>n.id!==id)
  expect(Math.abs(link.x-other.x)>=(link.width+other.width)/2||Math.abs(link.y-other.y)>=(link.height+other.height)/2).toBe(true)
  expect(draft.style.left).toBe(link.x+'px')
  expect(draft.style.top).toBe(link.y+'px')
  expect(()=>validateCanvas({files:[],artifacts:nodes.map(({generationLastSeq,...node}:any)=>node)})).not.toThrow()
  const input=draft.querySelector('textarea')
  input.value='https://example.com';await m.event('input',input)
  await m.event('click',draft.querySelector('[data-research-link-submit]'))
  expect(m.workspace.getSnapshot().artifacts.find((n:any)=>n.id===id)).toMatchObject({id,kind:'web-link',url:'https://example.com/',x:link.x,y:link.y,width:link.width,height:link.height})
  expect(m.query('[data-research-link-draft]')).toBeNull()
  await act(async()=>m.workspace.undo())
  expect(m.query('[data-research-link-draft]')).not.toBeNull()
})

it.each(['markdown','html'])('preserves drawn geometry through %s generation and refresh', async type => {
  const m = await mounted({}, undefined, { disabled: false })
  let node: any
  await act(async () => { node = m.workspace.createContainerDraft({x:470,y:330,width:510,height:290,sizeMode:'manual'}) })
  const geometry = {x:470,y:330,width:510,height:290,sizeMode:'manual'}
  for (const taskId of ['first','refresh']) {
    await act(async () => {
      m.workspace.beginContainerGeneration(node.id, '生成内容')
      m.workspace.attachGenerationTask(node.id, {taskId,canvasNodeId:node.id,state:"running",lastSeq:0})
      expect(m.workspace.applyGenerationInspection(node.id, {taskId,canvasNodeId:node.id,state:'completed',lastSeq:1,events:[],finalOutput:JSON.stringify(type==='html'?{version:1,type,title:'内容',html:'<div style="height:1200px">test</div>'}:{version:1,type,title:'内容',content:'# 标题\n'+ '正文内容'.repeat(200)})})).toBe(true)
    })
    expect(m.workspace.getSnapshot().artifacts.find((n:any)=>n.id===node.id)).toMatchObject({...geometry,generationStatus:'completed'})
  }
})


it('reads live webpage content when the component toolbar generates a summary', async () => {
  const inspect=vi.fn(async()=>({title:'搜索结果',url:'https://www.bing.com/search?q=test',sourceText:'实际搜索结果：第一条事实和第二条事实',scrollWidth:800,clientWidth:600}))
  const generate=vi.fn(async()=>({ok:true}))
  const m=await mounted({researchLinkFrame:{inspect}},undefined,{disabled:false,generate})
  await act(async()=>{
    m.workspace.setArtifacts([{id:'web',kind:'web-link',messageId:'web',title:'搜索',url:'https://www.bing.com/',excerpt:'https://www.bing.com/',sourceText:'过期内容',x:100,y:100,width:600,height:400}])
    m.workspace.updateSelection(['web'],'replace')
  })
  const button=Array.from(m.host.querySelectorAll('[data-research-selection-actions] button')).find((b:any)=>b.textContent==='总结提炼')
  expect(button).toBeTruthy()
  await m.event('click',button)
  expect(inspect).toHaveBeenCalledWith({sessionId:'target',nodeId:'web'})
  expect(generate).toHaveBeenCalledTimes(1)
  const generated=m.workspace.getSnapshot().artifacts.find((n:any)=>n.kind==='generated-summary')
  expect(JSON.stringify(generated.generationSources)).toContain('实际搜索结果：第一条事实和第二条事实')
  expect(JSON.stringify(generated.generationSources)).not.toContain('过期内容')
})

  it('includes inspected webpage text when a link component tag is sent to Research chat', async () => {
    const inspect = vi.fn()
    const m = await mounted({researchLinkFrame:{inspect}})
    const client = m.bundle
    expect(client.InputHub).toBeTypeOf('function')
    expect(client.ResearchWorkspaceRegistry).toBeTypeOf('function')
    if (typeof client.InputHub !== 'function' ||
        typeof client.ResearchWorkspaceRegistry !== 'function') return

    const sourceText = 'DaDa 是面向 Z 世代投资者的 ETF 投资伙伴，支持观点转组合与动态再平衡。'
    const link = {
      id: 'web-link-1', kind: 'web-link', messageId: 'web-link-1',
      title: 'DaDa：AI 原生的 Z 世代 ETF 投资伙伴',
      excerpt: 'https://efund.feishu.cn/docx/example',
      url: 'https://efund.feishu.cn/docx/example',
      sourceText: '过期的页面正文',
      x: 100, y: 120
    }
    const sessionId = 'target'
    const registry = m.registry
    await act(async()=>m.workspace.setArtifacts([link]))
    const sendSession = vi.fn(async (_session: unknown, _prompt: string) => undefined)
    const hub = new client.InputHub({
      get: (name: string) => name === 'conversation'
        ? { sendSession, releaseDraftImage: () => undefined }
        : undefined
    }, (key: string) => key, registry)
    hub.setResearchActive(sessionId, true)

    const reference = client.researchArtifactReference(link)
    const marker = await client.researchArtifactReferenceCodec.serialize(
      reference.ref,
      new AbortController().signal
    )
    expect(marker).not.toContain(sourceText)
    inspect.mockResolvedValue({title:link.title,sourceText,url:link.url,scrollWidth:900,clientWidth:600})
    await hub.sink({ sessionId }, `${marker}请分析该网页的产品定位`, [], 'queue')

    expect(inspect).toHaveBeenCalledWith({sessionId,nodeId:link.id})
    expect(sendSession).toHaveBeenCalledTimes(1)
    const prompt = sendSession.mock.calls[0]?.[1] as string
    expect(client.parseResearchPrompt(prompt)).toMatchObject({
      text: '请分析该网页的产品定位',
      artifacts: [{
        id: link.id,
        kind: 'web-link',
        title: link.title,
        excerpt: link.excerpt,
        sourceText
      }]
    })
    inspect.mockResolvedValue(null)
    await hub.sink({sessionId}, `${marker}再次分析`, [], 'queue')
    expect(sendSession).toHaveBeenCalledTimes(1)
  })

it('link draft shares expand, rename and remove actions without losing entered URL',async()=>{
  const m=await mounted({},undefined,{disabled:false})
  await m.event('click',m.query('[data-research-global-link]'))
  const draft=m.query('[data-research-link-draft]'),input=draft.querySelector('textarea')
  input.value='https://example.com';await m.event('input',input)
  draft.showModal=()=>draft.setAttribute('open','');draft.close=()=>draft.removeAttribute('open')
  await m.event('click',draft.querySelector('[data-research-container-expand]'))
  expect(draft.hasAttribute('open')).toBe(true)
  await m.event('click',draft.querySelector('[data-research-container-expand]'))
  expect(draft.hasAttribute('open')).toBe(false)
  expect(input.value).toBe('https://example.com')
  await m.event('click',draft.querySelector('[data-research-frame-more]'))
  const menuitem=(text:string)=>[...m.win.document.querySelectorAll('[role=menuitem]')].find(el=>el.textContent?.includes(text))
  await m.event('click',menuitem('修改名称'))
  const title=draft.querySelector('input')
  expect(title).not.toBeNull()
  title.value='资料网页';await m.event('input',title);await m.event('keydown',title,{key:'Enter'})
  expect(m.workspace.getSnapshot().artifacts[0].title).toBe('资料网页')
  await m.event('click',draft.querySelector('[data-research-frame-more]'))
  await m.event('click',menuitem('从画布移除'))
  expect(m.query('[data-research-link-draft]')).toBeNull()
})
