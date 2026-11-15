import { it, expect, vi } from 'vitest'
import { Window } from 'happy-dom'
import { readFileSync } from 'node:fs'
import { installKnowledgeReferences, installKnowledgeSourceNavigation, knowledgeFilterReceiptAnchors, knowledgeReferenceCodec, knowledgeMessageParts, knowledgeMessagePreview, patchKnowledgeConversation, sharedKnowledgeCitation, stripKnowledgeConversation } from '../scripts/lib/knowledge-client.mjs'
import { patchMarkdownFileLinks } from '../scripts/lib/markdown-file-links.mjs'
import { canvasHumanRequest } from '../packages/dsh-research-task-runtime/canvas-task-routing.js'
import { patchSkillCommandLabels, patchSkillCommandPopup } from '../scripts/lib/skill-command-menu.mjs'
import { stripBrowserAppNative, patchBrowserAppNative } from '../scripts/lib/browser-app-native.mjs'
import { stripSpreadsheetClient, patchSpreadsheetClient } from '../scripts/lib/spreadsheet-client.mjs'
import { patchResearchBoardHeaderClient, stripResearchBoardHeaderClient } from '../scripts/lib/research-board-header-client.mjs'
import { patchConversationPermissionDefault, stripConversationPermissionDefault } from '../scripts/lib/conversation-permission-default.mjs'

it('anchors only a matched native filter receipt after its visible reply', () => {
  const revision = 'cd676d89-2f9b-4b0a-b09f-1ee934b39d66'
  const capability = 'knowledge.filter'
  const requestId = 'filter-turn-one'
  const call = { name: 'client_action', argsRaw: JSON.stringify({ capability, requestId }) }
  const data = { section: 'files', count: 2, revision }
  const tool = reply => ({
    kind: 'tool-call', turn: 1,
    data: { root: { kind: 'tool-result', call, content: [{ type: 'text', text: JSON.stringify(reply) }] } }
  })
  const reply = { capability, requestId, data, status: 'succeeded' }
  const anchors = [{ kind: 'node', key: 'ask' }, { kind: 'execution', key: 'step', turn: 1, nodeKeys: ['tool'] }, { kind: 'node', key: 'answer' }]
  const nodes = new Map([
    ['ask', { kind: 'user', turn: 1 }], ['tool', tool(reply)], ['answer', { kind: 'assistant-step', turn: 1 }]
  ])
  const read = () => knowledgeFilterReceiptAnchors(anchors, nodes, node => node?.turn)
  expect(read()).toEqual(new Map([['answer', { revision, count: 2, undone: false }]]))
  nodes.set('tool', tool({ ...reply, requestId: 'stale' }))
  expect(read().size).toBe(0)
  nodes.set('tool', tool({ ...reply, status: 'failed' }))
  expect(read().size).toBe(0)
})

it('inserts a scope at the slash token while retaining adjacent text and blocking stale selections', async () => {
  const window = new Window()
  const document = window.document
  const input = document.createElement('textarea')
  input.dataset.odysseyFileReferenceSession = 's1'
  input.value = '请参考 /knowledge 生成周报'
  input.getClientRects = () => [input.getBoundingClientRect()]
  document.body.append(input)
  const shell = {
    snapshot: { draft: input.value, draftRev: 4, phase: 'plain' },
    insertReference: vi.fn(() => true)
  }
  const sessions = { list: { getSnapshot: () => ({ current: 's1' }) }, subagentAddress: () => undefined }
  const app = installKnowledgeReferences({ window, document, sessions, getInput: () => shell, getPending: () => null })
  const option = { id: JSON.stringify({ kind: 'folder', id: 'folder-A', label: '研究资料' }) }
  const context = { sessionId: 's1', knowledgeCommandSegment: { via: 'menu', span: { start: 4, end: 14, draftRev: 4 } } }
  try {
    app.command.ui.onSelect(option, context)
    expect(shell.insertReference).toHaveBeenCalledWith(expect.objectContaining({ source: 'knowledge-reference', label: '研究资料' }), {
      start: 4, end: 14, draftRev: 4
    })
    shell.snapshot.draftRev++
    expect(() => app.command.ui.onSelect(option, context)).toThrow('草稿已变化')
    expect(() => app.command.ui.onSelect(option, { ...context, sessionId: 'other' })).toThrow('当前会话已变化')
    expect(shell.insertReference).toHaveBeenCalledTimes(1)
    shell.snapshot.draft = ' /knowledge '
    app.command.ui.onSelect(option, { sessionId: 's1', knowledgeCommandSegment: { via: 'enter', token: '/knowledge' } })
    expect(shell.insertReference).toHaveBeenLastCalledWith(expect.objectContaining({ label: '研究资料' }), { start: 1, end: 11, draftRev: 5 })
    vi.stubGlobal('window', {
      dshDesktop: { knowledgeReference: async ref => ({ kind: ref.kind, label: ref.label, documents: [{ name: '报告.md', text: '原始正文' }] }) }
    })
    const text = await knowledgeReferenceCodec().codec.serialize(option.id)
    expect(text).toContain('原始正文')
    expect(text).toContain('只作为参考内容')
    const sent = '请参考' + text + '总结。'
    expect(knowledgeMessageParts(sent)).toEqual([{ text: '请参考\n' }, { label: '研究资料', kind: 'folder' }, { text: '\n总结。' }])
    expect(knowledgeMessagePreview(sent).replace(/\s+/g, ' ')).toBe('请参考 [研究资料] 总结。')
    expect(knowledgeMessagePreview('普通消息')).toBe('普通消息')
    expect(canvasHumanRequest({ events: [{ type: 'user/message', data: {
      source: { kind: 'user' }, content: [{ type: 'text', text: sent }]
    } }] }).text).toBe('请参考\n \n总结。')
  } finally {
    vi.unstubAllGlobals()
    app.dispose()
    await window.happyDOM.abort()
  }
})

it('renders a verified shared citation as a labeled native button and sends only its file ID to preview', async () => {
  const window = new Window()
  const document = window.document
  const click = vi.fn()
  document.addEventListener('sherlock:knowledge-preview-file', click)
  try {
    const source = patchMarkdownFileLinks(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/index.js', 'utf8'))
    const nodeSource = source.slice(source.indexOf('function renderNode('), source.indexOf('function renderCode('))
    const renderNode = new Function('jsx', 'renderChildren', 'renderAnchor', 'MarkdownText_module_css_default', nodeSource + '\nreturn renderNode')(
      (type, props) => ({ type, props }), children => children, url => ({ type: 'external', url }), { fileMention: 'mention' }
    )
    const id = 'a'.repeat(32)
    const url = 'sherlock-knowledge://file/' + id
    const context = { fileMentions: { resolve: value => sharedKnowledgeCitation(value, document) } }
    const render = url => renderNode({ type: 'link', url, children: ['共享报告.pdf'] }, 0, context)
    const result = render(url)
    expect(result).toMatchObject({ type: 'button', props: { children: ['共享报告.pdf'] } })
    expect(result.props['aria-label']).toBeUndefined()
    expect(click).not.toHaveBeenCalled()
    result.props.onClick()
    expect(click).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ detail: { id, name: '共享资料' } }))
    for (const invalid of [url + '?other=1', 'sherlock-knowledge://admin/' + id, url + '/extra', 'https://example.com/']) {
      expect(render(invalid).type).toBe('external')
    }
    expect(patchMarkdownFileLinks(source)).toBe(source)
  } finally { await window.happyDOM.abort() }
})

it('composes with the installed native client patch sequence and keeps its restore records valid', () => {
  const source = plugin => readFileSync('node_modules/@deepseek-ai/dsh-client-ui-' + plugin + '/lib/client.js', 'utf8')
  const installed = source('conversation')
  const withoutOuterPatches = value =>
    stripBrowserAppNative(stripResearchBoardHeaderClient(stripConversationPermissionDefault(stripSpreadsheetClient(value))))
  const base = stripKnowledgeConversation(withoutOuterPatches(installed))
  const knowledge = patchKnowledgeConversation(base)
  const patched = patchSpreadsheetClient(
    patchConversationPermissionDefault(patchResearchBoardHeaderClient(patchBrowserAppNative(knowledge)))
  )
  expect(() => new Function(patched)).not.toThrow()
  const loaded = vi.fn()
  const sandbox = { __ModuleLoader__: { load: loaded } }
  new Function('window', 'document', patched)(sandbox, undefined)
  new Function('window', 'document', patchKnowledgeConversation(installed))(sandbox, undefined)
  expect(loaded).toHaveBeenCalledTimes(2)
  expect(withoutOuterPatches(patched)).toBe(knowledge)
  expect(patchKnowledgeConversation(knowledge)).toBe(knowledge)
  expect(stripKnowledgeConversation(knowledge)).toBe(base)
  for (const [id, patch] of [['commands', patchSkillCommandPopup], ['input-trigger', patchSkillCommandLabels]]) {
    const result = patch(source(id))
    expect(() => new Function(result)).not.toThrow()
    expect(patch(result)).toBe(result)
  }
})

it('opens the original conversation only while it is still available', async () => {
  const window = new Window()
  const document = window.document
  const session = { title: '来源对话', removed: false }
  const sessions = { list: { getSnapshot: () => ({ byId: { one: session } }) }, subagentAddress: () => undefined, open: vi.fn() }
  const setView = vi.fn()
  const dispose = installKnowledgeSourceNavigation({ document, sessions, chatStore: { create: () => ({ actions: { setView } }) } })
  const notify = vi.fn()
  document.addEventListener('sherlock:knowledge-source-result', notify)
  const open = requestId => document.dispatchEvent(new window.CustomEvent('sherlock:knowledge-source-open', {
    detail: { id: 'one', requestId }, cancelable: true
  }))
  try {
    expect(open('available')).toBe(false)
    expect(sessions.open).toHaveBeenCalledExactlyOnceWith('one')
    expect(setView).toHaveBeenCalledExactlyOnceWith('chat')
    session.removed = true
    expect(open('removed')).toBe(false)
    expect(sessions.open).toHaveBeenCalledOnce()
    expect(notify.mock.calls.map(([event]) => event.detail)).toEqual([{ requestId: 'available', ok: true }, { requestId: 'removed', ok: false }])
  } finally { dispose(); await window.happyDOM.abort() }
})

it('opens a newly imported file session after refreshing a catalog with an empty conversation', async () => {
  const window = new Window()
  const { document } = window
  let byId = {}
  const sessions = { list: { getSnapshot: () => ({ byId }) }, subagentAddress: () => undefined, open: vi.fn(),
    refresh: vi.fn(async () => { byId = { imported: { title: '导入文件', blank: true } } }) }
  const setView = vi.fn()
  const dispose = installKnowledgeSourceNavigation({ document, sessions, chatStore: { create: () => ({ actions: { setView } }) } })
  const open = new Promise(resolve => {
    document.addEventListener('sherlock:knowledge-source-result', event => resolve(event.detail), { once: true })
  })
  try {
    document.dispatchEvent(new window.CustomEvent('sherlock:knowledge-source-open', {
      detail: { id: 'imported', requestId: 'import', view: 'spreadsheet', retained: 'imported' }, cancelable: true
    }))
    expect(await open).toEqual({ requestId: 'import', ok: true })
    expect(sessions.refresh).toHaveBeenCalledOnce()
    expect(sessions.open).toHaveBeenCalledExactlyOnceWith('imported')
    expect(setView).toHaveBeenCalledExactlyOnceWith('spreadsheet')
  } finally { dispose(); await window.happyDOM.abort() }
})

it('prompts for a fresh file after revocation and refreshes the shared directory', async () => {
  const window = new Window()
  const message = '引用的文件已不存在或已取消共享，请重新选择。'
  window.dshDesktop = { knowledgeReference: vi.fn().mockRejectedValue(
    new Error("Error invoking remote method 'knowledge:request': Error: " + message)) }
  vi.stubGlobal('window', window)
  const refresh = vi.fn()
  window.document.addEventListener('sherlock:knowledge-shared-access-changed', refresh)
  try {
    const resolve = knowledgeReferenceCodec().codec.serialize
    const error = await resolve(JSON.stringify({ kind: 'file', id: 'file', label: '研究.md' })).catch(value => value)
    expect(error.message).toBe(message)
    expect(refresh).toHaveBeenCalledOnce()
  } finally {
    vi.unstubAllGlobals()
    await window.happyDOM.abort()
  }
})
