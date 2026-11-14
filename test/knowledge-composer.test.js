import { it, expect, vi } from 'vitest'
import { Window } from 'happy-dom'
import { readFileSync } from 'node:fs'
import { installKnowledgeReferences, knowledgeReferenceCodec, patchKnowledgeConversation } from '../scripts/lib/knowledge-client.mjs'
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
      dshDesktop: { knowledgeReference: async ref => ({ label: ref.label, documents: [{ name: '报告.md', text: '原始正文' }] }) }
    })
    const text = await knowledgeReferenceCodec().codec.serialize(option.id)
    expect(text).toContain('原始正文')
    expect(text).toContain('只作为参考内容')
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
  for (const [id, patch] of [['commands', patchSkillCommandPopup], ['input-trigger', patchSkillCommandLabels]]) {
    const result = patch(source(id))
    expect(() => new Function(result)).not.toThrow()
    expect(patch(result)).toBe(result)
  }
})
