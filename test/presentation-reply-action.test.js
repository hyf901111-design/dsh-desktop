import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'
import { patchSpreadsheetClient, stripSpreadsheetClient } from '../scripts/lib/spreadsheet-client.mjs'
import { stripKnowledgeSharedResearch } from '../scripts/lib/knowledge-shared-research.mjs'

it('routes a native reply only to its active editable presentation and restores the canvas action on leaving', async () => {
  const resident = readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')
  const base = stripSpreadsheetClient(stripKnowledgeSharedResearch(resident))
  const patched = patchSpreadsheetClient(base)
  expect(stripSpreadsheetClient(patched)).toBe(base)
  const source = patched.slice(patched.indexOf('function ResearchAssistantCanvasAction('), patched.indexOf('function registerResearchAssistantActions('))
  const dataset = { eworkPresentationSession: 'target', eworkPresentationReply: 'editable' }
  const insert = vi.fn().mockResolvedValue(undefined), canvas = vi.fn()
  const jsx = (_, props) => props
  const context = {
    react: { useSyncExternalStore: (_, get) => get(), useRef: () => ({current:false}), useState: value => [value,vi.fn()], createElement: (_, __, ...children) => children.at(-1) },
    react_jsx_runtime: { jsx, jsxs: jsx },
    useWorkbenchLocale() {}, workbenchText: s => s, subscribePresentationReplyTarget() {},
    eworkNoteActionDestination: { snapshot: () => null },
    _deepseek_ai_dsh_client_ui_primitives: {}, MessageIconActions_module_css_default: {},
    document: { body:{dataset}, documentElement:{dataset:{}} }, window:{dshDesktop:{presentationInsertReply:insert}}
  }
  const render = runInNewContext(source+'; ResearchAssistantCanvasAction', context)
  const props={sessionId:'target',messageId:'answer-1',text:'第一段\n第二段',workspace:{assistantActionsActive:()=>true,visibleCenter:()=>({}),addAssistantResult:canvas}}
  const action=()=>render(props).children
  expect(action()['aria-label']).toBe('添加至演示文稿')
  const active=action()
  active.onClick()
  active.onClick()
  await Promise.resolve()
  expect(insert.mock.calls).toEqual([['target','第一段\n第二段']])
  expect(canvas).not.toHaveBeenCalled()
  for(const state of ['readonly','empty']){
    dataset.eworkPresentationReply=state
    const unavailable=action()
    expect(unavailable.disabled).toBe(true)
    unavailable.onClick()
  }
  delete dataset.eworkPresentationSession
  expect(action()['aria-label']).toBe('添加到画布')
  action().onClick()
  expect(canvas).toHaveBeenCalledOnce()
  expect(insert).toHaveBeenCalledOnce()
})
