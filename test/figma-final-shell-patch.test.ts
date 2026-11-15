import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { createSourceFile, ScriptTarget, ScriptKind, forEachChild, isFunctionDeclaration } from 'typescript'
import { Context, Service } from '@deepseek-ai/cordis'
import { patchFigmaFinalConversation, patchFigmaFinalLayout } from '../scripts/lib/patch-figma-final-shell.mjs'
import {patchNotesActivity} from '../scripts/lib/notes-activity.mjs'

const source = await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')

const functionsByBundle = new Map<string, Map<string, string>>()
function clientFunction(bundle: string, name: string) {
  let functions = functionsByBundle.get(bundle)
  if (!functions) {
    functions = new Map()
    const syntax = createSourceFile('client.js', bundle, ScriptTarget.Latest, false, ScriptKind.JS)
    const visit = (node: any) => { if (isFunctionDeclaration(node) && node.name && !functions!.has(node.name.text)) functions!.set(node.name.text, node.getText(syntax)); forEachChild(node, visit) }
    visit(syntax); functionsByBundle.set(bundle, functions)
  }
  return functions.get(name) || ''
}

describe('Figma shell patch installation', () => {
  it('initializes the controller before slot render and replaces it on reload with proper disposal', async () => {
    const installed = patchFigmaFinalConversation(source)
    const apply = clientFunction(installed, 'apply')
    const begin = apply.indexOf('const inputHub = new InputHub(')
    const end = apply.indexOf('blocks: composerBlocks });', begin) + 'blocks: composerBlocks });'.length
    expect(end).toBeLessThan(apply.indexOf('sessions.provide('))
    expect(apply).not.toContain('concreteConversation(ctx)')
    expect(apply.match(/const conversation = conversationController;/g)).toHaveLength(3)
    const constructorStart = installed.indexOf('constructor(ctx, config)', installed.indexOf('var ConversationController = class'))
    const constructorEnd = installed.indexOf('\n\t\t\t}', constructorStart) + '\n\t\t\t}'.length
    const Controller = runInNewContext('class Controller extends Service { createdImageUrls = new Set(); draftAttachments = new Map(); imageUrls = new Map(); imageGenerations = new Map(); ' + installed.slice(constructorStart, constructorEnd) + ' }; Controller', { Service, revokePreview() {} })
    const initialize = runInNewContext('(ctx) => { const t = () => {}; const researchWorkspaces = {}; ' + apply.slice(begin, end) + ' return conversationController; }', {
      window: {}, ConversationController: Controller, InputHub: class {}, ComposerBlockRegistry: class {}
    })
    const root = new Context()
    let previous: { disposed: boolean; draftAttachments: Map<string, unknown> } | undefined
    for (let generation = 0; generation < 2; generation++) {
      let controller: typeof previous
      const fiber = root.plugin((ctx: Context) => {
        controller = initialize(ctx)
        // Simulate the immediate slot injection before the owning fiber is active.
        expect(controller).toBeDefined()
        expect(controller).not.toBe(previous)
        controller!.draftAttachments.set('draft', {})
      })
      await fiber.await()
      expect(root.get('conversation')).toBeDefined()
      await fiber.dispose()
      expect(root.get('conversation')).toBeUndefined()
      expect(controller!.disposed).toBe(true)
      expect(controller!.draftAttachments.size).toBe(0)
      previous = controller
    }
    expect(patchFigmaFinalConversation(installed)).toBe(installed)
  })

  it('shows project controls only before the first message in either conversation surface', () => {
    const installed = patchFigmaFinalConversation(source)
    const element = (type: unknown, props: Record<string, unknown>) => ({ type, props })
    const ComposerSurface = runInNewContext(clientFunction(installed, 'ComposerSurface') + '\nComposerSurface', {
      EditableSessionTitle: "button",
      useSkillPresentation: () => (text: unknown) => text,
      projectSkillText: (text: unknown) => text,
      react_jsx_runtime: { jsx: element, jsxs: element },
      clsx: (...names: unknown[]) => names.filter(Boolean).join(' '),
      ConversationRoot_module_css_default: {}, HeroGlow: 'glow', HeroShell: 'headline'
    })
    const row = element('button', { children: '选择工作区' })
    const input = element('textarea', {})
    for (const state of [
      { hero: true, research: false, researchEmpty: false, visible: true },
      { hero: false, research: true, researchEmpty: true, visible: true },
      { hero: false, research: true, researchEmpty: false, visible: false },
      { hero: false, research: false, researchEmpty: false, visible: false }
    ]) {
      const tree = ComposerSurface({ ...state, heroWorkspaceRow: row, inputBar: input,
        renderSlotChain: (_name: string, _context: unknown, options: { fallback: unknown }) => options.fallback })
      const children = tree.props.children.props.children
      expect(children.includes(row)).toBe(state.visible)
      expect(children.includes(input)).toBe(true)
    }
    expect(patchFigmaFinalConversation(installed)).toBe(installed)
  })

  it('commits the pointer-up position when a quick sidebar drag has no delivered move event', async () => {
    const layout = patchFigmaFinalLayout(await readFile('node_modules/@deepseek-ai/dsh-client-ui-layout/lib/client.js', 'utf8'))
    const moves: number[] = [], lifecycle: string[] = []
    const DragHandle = runInNewContext(clientFunction(layout, 'DragHandle') + '\nDragHandle', {
      react: { useState: () => [false, () => {}], useRef: (current: unknown) => ({ current }), useCallback: (fn: unknown) => fn, useEffect: () => {} },
      react_jsx_runtime: { jsx: (_tag: string, props: unknown) => props }, AppFrame_module_css_default: { handle: 'handle' },
      requestAnimationFrame: () => 1, cancelAnimationFrame: () => {}
    })
    let captured = false
    const target = { setPointerCapture: () => { captured = true }, hasPointerCapture: () => captured, releasePointerCapture: () => { captured = false } }
    const handle = DragHandle({ side: 'sidebar', left: 280, onStart: () => lifecycle.push('start'), onDrag: (dx: number) => moves.push(dx), onEnd: () => lifecycle.push('end') })
    handle.onPointerDown({ button: 0, pointerId: 1, clientX: 280, currentTarget: target, preventDefault() {} })
    handle.onPointerUp({ pointerId: 1, clientX: 240, currentTarget: target })
    expect(moves).toEqual([-40])
    expect(lifecycle).toEqual(['start', 'end'])
    expect(captured).toBe(false)
  })

  it('finishes outside the handle after pointer capture is lost, and clears cancellation', async () => {
    const layout = patchFigmaFinalLayout(await readFile('node_modules/@deepseek-ai/dsh-client-ui-layout/lib/client.js', 'utf8'))
    const effects: (() => void)[] = [], moves: number[] = [], lifecycle: string[] = []
    const listeners = new Map<string, (event: unknown) => void>()
    const win = { addEventListener: (name: string, fn: (event: unknown) => void) => listeners.set(name, fn), removeEventListener: (name: string) => listeners.delete(name) }
    const DragHandle = runInNewContext(clientFunction(layout, 'DragHandle') + '\nDragHandle', {
      react: { useState: () => [true, () => {}], useRef: (current: unknown) => ({ current }), useCallback: (fn: unknown) => fn, useEffect: (fn: () => void) => effects.push(fn) },
      react_jsx_runtime: { jsx: (_tag: string, props: unknown) => props }, AppFrame_module_css_default: { handle: 'handle' },
      requestAnimationFrame: () => 1, cancelAnimationFrame: () => {}
    })
    // Mirrors the native failure: capture is gone before the next move/up.
    const target = { ownerDocument: { defaultView: win }, setPointerCapture() {}, hasPointerCapture: () => false, releasePointerCapture() { throw Error('No capture to release') } }
    const handle = DragHandle({ side: 'sidebar', left: 280, onStart: () => lifecycle.push('start'), onDrag: (dx: number) => moves.push(dx), onEnd: () => lifecycle.push('end') })
    handle.onPointerDown({ button: 0, pointerId: 1, clientX: 280, currentTarget: target, preventDefault() {} })
    effects.forEach(fn => fn())
    listeners.get('pointermove')!({ pointerId: 1, clientX: 252 })
    listeners.get('pointerup')!({ pointerId: 1, clientX: 240 })
    expect(moves).toEqual([-40])
    expect(lifecycle).toEqual(['start', 'end'])
    handle.onPointerDown({ button: 0, pointerId: 2, clientX: 240, currentTarget: target, preventDefault() {} })
    listeners.get('pointercancel')!({ pointerId: 2 })
    listeners.get('pointerup')!({ pointerId: 2, clientX: 400 })
    expect(moves).toEqual([-40])
    expect(lifecycle).toEqual(['start', 'end', 'start', 'end'])
  })

  it('keeps a custom sidebar width after dragging, collapse and layout restoration', async () => {
    const layout = patchFigmaFinalLayout(await readFile('node_modules/@deepseek-ai/dsh-client-ui-layout/lib/client.js', 'utf8'))
    expect(patchFigmaFinalLayout(layout)).toBe(layout)
    const { store, compute } = runInNewContext([
      clientFunction(layout, 'clampWidth'), clientFunction(layout, 'computeColumns'), clientFunction(layout, 'createLayoutStore'),
      '({store:createLayoutStore(),compute:computeColumns})'
    ].join('\n'), { COLLAPSED_SIDEBAR_WIDTH: 80, _deepseek_ai_dsh_client_runtime_client: { defineStore: (spec: unknown) => spec } })
    const state = store.init()
    expect(state.sidebar).toBe(280)
    store.actions.setSidebar(state, 240)
    expect(compute(1380, state.sidebar, 0).sidebar).toBe(240)
    store.actions.setSidebar(state, 100)
    expect(state.sidebar).toBe(240)
    store.actions.toggleSidebar(state)
    expect(state.sidebar).toBe(0)
    expect(compute(1380, state.sidebar, 0).sidebar).toBe(80)
    store.actions.toggleSidebar(state)
    expect(state.sidebar).toBe(240)
    store.actions.setSidebar(state, 320)
    store.actions.toggleSidebar(state)
    store.actions.toggleSidebar(state)
    expect(state.sidebar).toBe(320)
    // Automatic research collapse also preserves the most recent width.
    state.sidebarManuallyExpanded = false
    store.actions.collapseSidebarForResearch(state)
    expect(state.sidebar).toBe(0)
    store.actions.toggleSidebar(state)
    expect(state.sidebar).toBe(320)
    const previousState = { ...store.init(), sidebar: 360 }
    delete previousState.sidebarExpandedWidth
    store.actions.toggleSidebar(previousState)
    store.actions.toggleSidebar(previousState)
    expect(previousState.sidebar).toBe(360)
    expect(store.init().sidebar).toBe(280)
  })

  it('upgrades the installed layout once and safely renders the left handle before a DOM frame exists', async () => {
    const current = await readFile('node_modules/@deepseek-ai/dsh-client-ui-layout/lib/client.js', 'utf8')
    const installed = patchFigmaFinalLayout(current)
    expect(patchFigmaFinalLayout(installed)).toBe(installed)
    expect(installed.match(/function SidebarDragHandle\(/g)).toHaveLength(1)
    expect(clientFunction(installed, 'AppFrame')).toContain('jsx)(SidebarDragHandle,')
    // The right splitter keeps the native component and its existing scope.
    expect(clientFunction(installed, 'AppFrame')).toContain('cols.details > 0 && (0, react_jsx_runtime.jsx)(DragHandle,')
    const effects: (() => unknown)[] = []
    const SidebarDragHandle = runInNewContext(clientFunction(installed, 'SidebarDragHandle') + '\nSidebarDragHandle', {
      react: { useState: () => [null, () => {}], useEffect: (fn: () => unknown) => effects.push(fn) },
      react_jsx_runtime: { jsx: (type: unknown, props: unknown) => ({ type, props }) },
      DragHandle: 'native'
    })
    const result = SidebarDragHandle({ side: 'sidebar', left: 280, frameRef: { current: null } })
    expect(result.type).toBe('native')
    expect(result.props.left).toBe(280)
    expect(effects[0]!()).toBeUndefined()
  })

  it('can refresh a previously installed block without duplicating runtime styles', () => {
    const installed = patchFigmaFinalConversation(source)
    expect(patchFigmaFinalConversation(installed)).toBe(installed)
  })

  it('refuses partial or duplicated markers before damaging the client bundle', () => {
    const installed = patchFigmaFinalConversation(source)
    expect(() => patchFigmaFinalConversation(installed.replace('/* ODYSSEY_FIGMA_FINAL_SHELL_END */', ''))).toThrow('marker')
    expect(() => patchFigmaFinalConversation(installed + '\n/* ODYSSEY_FIGMA_FINAL_SHELL_START */')).toThrow('marker')
  })

  it('uses view-specific empty titles while preserving existing session titles', async () => {
    const installed = patchFigmaFinalConversation(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8'))
    const extract = (name: string) => {
      const start = installed.indexOf(`function ${name}(`)
      const end = installed.indexOf('\n\t\t}', start) + '\n\t\t}'.length
      return installed.slice(start, end)
    }
    const element = (type: unknown, props: Record<string, unknown>) => ({ type, props })
    const header = runInNewContext(`${extract('deriveAncestry')}\n${extract('equalBreadcrumbs')}\n${extract('conversationViewTabProps')}\n${extract('ConversationSessionHeader')}\nConversationSessionHeader`, {
      react: { useSyncExternalStore() {}, useEffect() {}, useCallback: (fn: unknown) => fn, useRef: () => ({ current: 'current' }), Fragment: 'fragment' },
      EditableSessionTitle: "button",
      useSkillPresentation: () => (text: unknown) => text,
      projectSkillText: (text: unknown) => text,
      react_jsx_runtime: { jsx: element, jsxs: element },
      ConversationRoot_module_css_default: new Proxy({}, { get: (_target, key) => key }),
      clsx: (...values: unknown[]) => values.filter(Boolean).join(' '),
      document: { documentElement: { dataset: { odysseyLocale: "zh" } } },
      useSherlockBoardOnly: () => false,
      isInitialResearchSession: () => false,
      isPersistedResearchSession: () => false,
      explicitResearchViewSessions: new Set(),
      explicitHomeViewSessions: new Set(['current']),
      resolveActiveView: (tabs: { id: string }[], selected: string) => tabs.find(tab => tab.id === selected)
    })
    for (const [view, blank, phase, title, displayTitle, expected] of [
      ['research', true, 'blank', undefined, '测试集', '新研究'],
      ['research', true, 'blank', '我的研究', '我的研究', '我的研究'],
      ['research', false, 'active', undefined, '已有研究', '已有研究'],
      ['research', true, 'sending', undefined, '正在研究', '正在研究'],
      ['chat', false, 'active', undefined, '原对话标题', '原对话标题'],
      ['chat', true, 'blank', undefined, '测试集', '新会话'],
      ['trajectory', true, 'blank', undefined, '测试集', '新轨迹']
    ] as const) {
      const tree = header({
        sessionId: 'current',
        useSession: (select: (s: unknown) => unknown) => select({ blank, composerPhase: phase }),
        useSessions: (select: (s: unknown) => unknown) => select({ byId: { current: { id: 'current', displayTitle, title } } }),
        useStore: (select: (s: unknown) => unknown) => select({ view }),
        views: { subscribe() {}, version: () => 1, list: () => [{ id: 'chat' }, { id: 'research' }, { id: 'trajectory' }] },
        actions: {}, renderSlot: () => null, open() {}, t: (key: string) => key
      })
      expect(tree.props['aria-hidden']).toBeUndefined()
      expect(tree.props['data-odyssey-home-header']).toBe(view === 'chat' && blank && phase === 'blank')
      const titles: unknown[] = []
      const visit = (node: any) => {
        if (!node || typeof node !== 'object') return
        if (Array.isArray(node)) { node.forEach(visit); return }
        if (node.type === 'button' && node.props.className === 'crumb crumbCurrent') titles.push(node.props.children)
        visit(node.props?.children)
      }
      visit(tree)
      expect(titles).toEqual(expected === null ? [] : [expected])
    }
  })

  it('limits the Figma input hint to unblocked empty Research while preserving other placeholders', async () => {
    const installed = patchFigmaFinalConversation(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8'))
    const start = installed.indexOf('const inputBar = renderSlot("conversation.composer.bar", {')
    const end = installed.indexOf('\n\t\t\tconst phase =', start)
    const expression = installed.slice(start, end) + '\ninputBar'
    const resolve = (state: Record<string, unknown>) => runInNewContext(expression, {
      renderSlot: (_name: string, props: unknown) => props,
      hero: false, researchEmpty: false, inert: false, composerBlock: undefined, subagentPanel: false, activeView: 'research',
      researchFileReferences: undefined, researchArtifactReferences: undefined,
      research: true, sessionId: 'current', researchWorkspace: {}, pickerOpen: false,
      setPickerOpen() {}, zone: undefined, t: (key: string) => key, ...state
    }).placeholder
    expect(resolve({ researchEmpty: true })).toBe('描述你想研究的问题…')
    expect(resolve({ researchEmpty: false })).toBeUndefined()
    expect(resolve({ research: false, hero: true })).toBe('placeholder.hero')
    expect(resolve({ researchEmpty: true, composerBlock: { reason: '权限不足' } })).toBe('权限不足')
    expect(resolve({ researchEmpty: true, inert: true })).toBe('placeholder.workspace')
  })

  it.each([false,true])('renders short Research messages without exposing automatic context with note bubbles %s', notes => {
    const installed = patchFigmaFinalConversation(notes?patchNotesActivity(source):source)
    const element = (type: unknown, props: Record<string, unknown>) => ({ type, props })
    const context = { totalSources: 1, initialSourceIds: [] }
    const research = { text: '好', files: [] as unknown[], artifacts: [] as unknown[], canvasContext: context }
    const projected: unknown[] = []
    const bubble = runInNewContext(`${clientFunction(installed, 'UserStyleBubble')}\nUserStyleBubble`, {
      contentParts: () => ({ text: 'opaque research prompt', images: [], rest: [] }),
      parseResearchPrompt: () => research,
      projectResearchUserText: (value: typeof research) => { projected.push(value); return value.text },
      EditableSessionTitle: "button",
      useSkillPresentation: () => (text: unknown) => text,
      projectSkillText: (text: unknown) => text,
      react_jsx_runtime: { jsx: element, jsxs: element },
      MessageItem_module_css_default: { userRow: 'userRow', userStack: 'userStack', bubble: 'bubble' },
      _deepseek_ai_dsh_client_ui_attachment: { ImageGallery: 'images' },
      messageImageLabels: () => ({}),
      _deepseek_ai_dsh_client_ui_primitives: { JsonBlock: 'json' }
    })
    const tree = bubble({ content: [], t: (key: string) => key })
    // React omits null/undefined children, including absent optional references.
    expect(tree.props.children[0].props.children[1].props.children.filter((child:unknown)=>child!==undefined&&child!==null)).toEqual(['好', []])
    expect(JSON.stringify(tree)).not.toContain('research-context-provenance')
    expect(projected[0]).toBe(research)
    expect(research.canvasContext).toBe(context)
    research.text = ''
    const contextOnly = bubble({ content: [], t: (key: string) => key })
    expect(contextOnly.props.children[0].props.children[1]).toBe(false)
    for (const name of ['serializeResearchPrompt', 'parseResearchPrompt', 'projectResearchUserText']) {
      expect(clientFunction(installed, name)).toBe(clientFunction(source, name))
    }
    const input = clientFunction(installed, 'InputBar')
    expect(input).toContain('jsx)(ResearchCanvasContextBadge,')
    expect(input).toContain('"data-research-file-tag": researchFile?.id')
    expect(input).toContain('"data-research-artifact-tag": researchArtifact?.id')
  })
  it('shows the current canvas count and keeps the original scope toggle and explicit-reference precedence', () => {
    const installed=source.includes('"research.context.emptyBadge":')?source:patchFigmaFinalConversation(source)
    let snapshot={files:[] as any[],artifacts:[] as any[],selection:{selectedNodeIds:[] as string[]}}
    let optedOut=false
    const badge=runInNewContext(clientFunction(installed,'ResearchCanvasContextBadge')+'\nResearchCanvasContextBadge',{
      react:{useSyncExternalStore:()=>snapshot,useState:()=>[true,()=>{}],useId:()=> 'scope',useMemo:(fn:()=>unknown)=>fn()},
      react_jsx_runtime:{jsx:(type:unknown,props:unknown)=>({type,props}),jsxs:(type:unknown,props:unknown)=>({type,props})},
      researchPromptBasename:(name:string)=>name,FileReferenceIcon:'file',ResearchArtifactReferenceIcon:'artifact'
    })
    const props={workspace:{},input:{},keyboard:{setResearchContextOptOut:(next:boolean)=>{optedOut=next}},t:(key:string,value?:any)=>value?.total??key}
    expect(badge(props).props.children[0].props.children).toBe('research.context.emptyBadge')
    expect(badge({...props,input:{researchContextOptOut:true}}).props.children[0].props.children).toBe('research.context.disabled')
    snapshot.artifacts=[{id:'one',title:'研究一'},{id:'two',title:'研究二'}]
    snapshot.files=[{id:'three',name:'数据.csv'}]
    const tree=badge(props)
    expect(tree.props.children[0].props.children).toBe(3)
    const directory=tree.props.children[1]
    expect(directory.props.children[0].props.children).toHaveLength(3)
    directory.props.children[1].props.onClick()
    expect(optedOut).toBe(true)
    expect(badge({...props,input:{researchContextOptOut:true}}).props.children[0].props.children).toBe('research.context.disabled')
    expect(badge({...props,input:{occurrences:[{id:'inline'}]}})).toBe(null)
    snapshot.selection.selectedNodeIds=['one']
    expect(badge(props)).toBe(null)
  })
})
