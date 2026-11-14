import { it, expect, vi } from 'vitest'
import { Window } from 'happy-dom'
import { readFileSync } from 'node:fs'
import { installKnowledgeReferences, installKnowledgeSourceNavigation, knowledgeReferenceCodec, knowledgeMessageParts, patchKnowledgeConversation, stripKnowledgeConversation } from '../scripts/lib/knowledge-client.mjs'
import { canvasHumanRequest } from '../packages/dsh-research-task-runtime/canvas-task-routing.js'
import { patchSkillCommandLabels, patchSkillCommandPopup } from '../scripts/lib/skill-command-menu.mjs'
import { stripBrowserAppNative, patchBrowserAppNative } from '../scripts/lib/browser-app-native.mjs'
import { stripSpreadsheetClient, patchSpreadsheetClient } from '../scripts/lib/spreadsheet-client.mjs'
import { stripResearchBoardHeaderClient } from '../scripts/lib/research-board-header-client.mjs'
import { stripConversationPermissionDefault } from '../scripts/lib/conversation-permission-default.mjs'

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
    expect(canvasHumanRequest({ events: [{ type: 'user/message', data: {
      source: { kind: 'user' }, content: [{ type: 'text', text: sent }]
    } }] }).text).toBe('请参考\n \n总结。')
  } finally {
    vi.unstubAllGlobals()
    app.dispose()
    await window.happyDOM.abort()
  }
})

it('composes with the installed native client patch sequence and keeps its restore records valid', () => {
  const source = plugin => readFileSync('node_modules/@deepseek-ai/dsh-client-ui-' + plugin + '/lib/client.js', 'utf8')
  const installed = source('conversation')
  const base = stripBrowserAppNative(stripResearchBoardHeaderClient(stripConversationPermissionDefault(stripSpreadsheetClient(installed))))
  const knowledge = patchKnowledgeConversation(base)
  const patched = patchSpreadsheetClient(patchBrowserAppNative(knowledge))
  expect(() => new Function(patched)).not.toThrow()
  expect(stripBrowserAppNative(stripSpreadsheetClient(patched))).toBe(knowledge)
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
