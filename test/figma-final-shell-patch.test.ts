import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { patchFigmaFinalConversation } from '../scripts/lib/patch-figma-final-shell.mjs'

const source = await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')

function clientFunction(bundle: string, name: string) {
  const start = bundle.indexOf(`\t\tfunction ${name}(`)
  const end = bundle.indexOf('\n\t\t}', start) + '\n\t\t}'.length
  return bundle.slice(start, end)
}

describe('Figma shell patch installation', () => {
  it('can refresh a previously installed block without duplicating runtime styles', () => {
    const installed = patchFigmaFinalConversation(source)
    expect(patchFigmaFinalConversation(installed)).toBe(installed)
  })

  it('refuses partial or duplicated markers before damaging the client bundle', () => {
    const installed = patchFigmaFinalConversation(source)
    expect(() => patchFigmaFinalConversation(installed.replace('/* ODYSSEY_FIGMA_FINAL_SHELL_END */', ''))).toThrow('marker')
    expect(() => patchFigmaFinalConversation(installed + '\n/* ODYSSEY_FIGMA_FINAL_SHELL_START */')).toThrow('marker')
  })

  it('uses the Figma empty Research title without replacing explicit titles or chat titles', async () => {
    const installed = patchFigmaFinalConversation(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8'))
    const extract = (name: string) => {
      const start = installed.indexOf(`\t\tfunction ${name}(`)
      const end = installed.indexOf('\n\t\t}', start) + '\n\t\t}'.length
      return installed.slice(start, end)
    }
    const element = (type: unknown, props: Record<string, unknown>) => ({ type, props })
    const header = runInNewContext(`${extract('deriveAncestry')}\n${extract('equalBreadcrumbs')}\n${extract('conversationViewTabProps')}\n${extract('ConversationSessionHeader')}\nConversationSessionHeader`, {
      react: { useSyncExternalStore() {}, useCallback: (fn: unknown) => fn, useRef: () => ({ current: null }), Fragment: 'fragment' },
      react_jsx_runtime: { jsx: element, jsxs: element },
      ConversationRoot_module_css_default: new Proxy({}, { get: (_target, key) => key }),
      clsx: (...values: unknown[]) => values.filter(Boolean).join(' '),
      isInitialResearchSession: () => false,
      isPersistedResearchSession: () => false,
      explicitResearchViewSessions: new Set(),
      resolveActiveView: (tabs: { id: string }[], selected: string) => tabs.find(tab => tab.id === selected)
    })
    for (const [view, blank, phase, title, displayTitle, expected] of [
      ['research', true, 'blank', undefined, '测试集', '新研究'],
      ['research', true, 'blank', '我的研究', '我的研究', '我的研究'],
      ['research', false, 'active', undefined, '已有研究', '已有研究'],
      ['research', true, 'sending', undefined, '正在研究', '正在研究'],
      ['chat', false, 'active', undefined, '原对话标题', '原对话标题']
    ] as const) {
      const tree = header({
        sessionId: 'current',
        useSession: (select: (s: unknown) => unknown) => select({ blank, composerPhase: phase }),
        useSessions: (select: (s: unknown) => unknown) => select({ byId: { current: { id: 'current', displayTitle, title } } }),
        useStore: (select: (s: unknown) => unknown) => select({ view }),
        views: { subscribe() {}, version: () => 1, list: () => [{ id: 'chat' }, { id: 'research' }] },
        actions: {}, renderSlot: () => null, open() {}, t: (key: string) => key
      })
      const titles: unknown[] = []
      const visit = (node: any) => {
        if (!node || typeof node !== 'object') return
        if (Array.isArray(node)) { node.forEach(visit); return }
        if (node.type === 'button' && node.props.className === 'crumb crumbCurrent') titles.push(node.props.children)
        visit(node.props?.children)
      }
      visit(tree)
      expect(titles).toEqual([expected])
    }
  })

  it('limits the Figma input hint to unblocked empty Research while preserving other placeholders', async () => {
    const installed = patchFigmaFinalConversation(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8'))
    const start = installed.indexOf('const inputBar = renderSlot("conversation.composer.bar", {')
    const end = installed.indexOf('\n\t\t\tconst phase =', start)
    const expression = installed.slice(start, end) + '\ninputBar'
    const resolve = (state: Record<string, unknown>) => runInNewContext(expression, {
      renderSlot: (_name: string, props: unknown) => props,
      hero: false, researchEmpty: false, inert: false, composerBlock: undefined,
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

  it('renders short Research messages without exposing automatic context while keeping explicit inline references', () => {
    const installed = patchFigmaFinalConversation(source)
    const element = (type: unknown, props: Record<string, unknown>) => ({ type, props })
    const context = { totalSources: 1, initialSourceIds: [] }
    const research = { text: '好', files: [] as unknown[], artifacts: [] as unknown[], canvasContext: context }
    const projected: unknown[] = []
    const bubble = runInNewContext(`${clientFunction(installed, 'UserStyleBubble')}\nUserStyleBubble`, {
      contentParts: () => ({ text: 'opaque research prompt', images: [], rest: [] }),
      parseResearchPrompt: () => research,
      projectResearchUserText: (value: typeof research) => { projected.push(value); return value.text },
      react_jsx_runtime: { jsx: element, jsxs: element },
      MessageItem_module_css_default: { userRow: 'userRow', userStack: 'userStack', bubble: 'bubble' },
      _deepseek_ai_dsh_client_ui_attachment: { ImageGallery: 'images' },
      messageImageLabels: () => ({}),
      _deepseek_ai_dsh_client_ui_primitives: { JsonBlock: 'json' }
    })
    const tree = bubble({ content: [], t: (key: string) => key })
    expect(tree.props.children[0].props.children[1].props.children).toEqual(['好', []])
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
    expect(input).not.toContain('jsx)(ResearchCanvasContextBadge,')
    expect(input).toContain('"data-research-file-tag": researchFile?.id')
    expect(input).toContain('"data-research-artifact-tag": researchArtifact?.id')
  })
})
