import { Window } from 'happy-dom'
import { expect, it, vi } from 'vitest'
import { installImageFactoryInput } from '../scripts/lib/image-factory-native.mjs'

function fixture() {
  const win = new Window(), doc = win.document
  const snapshot = { draft: '用文字生成海报', draftRev: 1, imageIds: [] }
  const shell = {
    snapshot,
    notify: vi.fn(),
    commitSend: vi.fn(),
    setResearchContextPreparing: vi.fn(),
    pruneImages: vi.fn(),
    setDraft: vi.fn(),
    dispose: vi.fn(),
  }
  const conversation = { releaseDraftImage: vi.fn() }
  const binding = installImageFactoryInput({ makeShell: () => shell, conversation, document: doc, window: win })
  const event = (name, detail) => doc.dispatchEvent(new win.CustomEvent('sherlock:image-factory-' + name, { detail }))
  return { win, doc, shell, binding, event }
}

it('uses a factory-only composer without submitting a resident conversation after switching away', async () => {
  const { win, doc, shell, binding, event } = fixture()
  try {
    let command
    doc.addEventListener('sherlock:image-factory-submit', event => {
      command = event.detail
      event.preventDefault()
    })
    doc.body.dataset.workspaceSurface = 'browser'
    await shell.submit()
    expect(command).toBeUndefined()

    doc.body.dataset.workspaceSurface = 'image-factory'
    event('state', { messages: [], canSend: true })
    await shell.submit()
    expect(command?.prompt).toBe('用文字生成海报')
    expect(shell.setResearchContextPreparing).toHaveBeenCalledWith(true)

    event('result', { id: 'other-job', success: true })
    expect(shell.commitSend).not.toHaveBeenCalled()
    event('result', { id: command.id, success: false })
    expect(shell.commitSend).not.toHaveBeenCalled()
    expect(shell.setResearchContextPreparing).toHaveBeenLastCalledWith(false)

    await shell.submit()
    event('result', { id: command.id, success: true })
    expect(shell.commitSend).toHaveBeenCalledExactlyOnceWith([], '用文字生成海报')
  } finally { binding.dispose(); await win.happyDOM.abort() }
})

it('keeps the native draft when a canvas command is unhandled and clears it on account reset', async () => {
  const { win, doc, shell, binding, event } = fixture()
  try {
    doc.body.dataset.workspaceSurface = 'image-factory'
    await shell.submit()
    expect(shell.notify).toHaveBeenCalledWith('error', expect.stringContaining('尚未就绪'))
    expect(shell.commitSend).not.toHaveBeenCalled()
    event('reset')
    expect(shell.setDraft).toHaveBeenCalledExactlyOnceWith('')
    expect(shell.setResearchContextPreparing).toHaveBeenLastCalledWith(false)
  } finally { binding.dispose(); await win.happyDOM.abort() }
})
