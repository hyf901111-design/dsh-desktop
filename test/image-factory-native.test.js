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

it('commits the native draft on admission and waits for completion before accepting another command', async () => {
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
    expect(shell.setResearchContextPreparing).toHaveBeenLastCalledWith(false)
    expect(shell.commitSend).toHaveBeenCalledExactlyOnceWith([], '用文字生成海报')
    const firstCommand = command
    event('result', { id: 'other-job' })
    await shell.submit()
    expect(command).toBe(firstCommand)

    event('result', { id: firstCommand.id })
    expect(shell.commitSend).toHaveBeenCalledTimes(1)
    shell.snapshot.draft = '新的图片需求'
    shell.snapshot.draftRev++
    await shell.submit()
    expect(command?.prompt).toBe('新的图片需求')
    expect(shell.commitSend).toHaveBeenLastCalledWith([], '新的图片需求')
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

it('fills a gallery prompt without sending and keeps manual text when switching examples', async () => {
  const { win, doc, shell, binding, event } = fixture()
  try {
    shell.setDraft.mockImplementation(draft => { shell.snapshot.draft = draft })
    const submit = vi.fn()
    doc.addEventListener('sherlock:image-factory-submit', submit)
    const use = prompt => doc.dispatchEvent(new win.CustomEvent('sherlock:image-factory-use-prompt', {
      detail: { prompt }, cancelable: true,
    }))
    doc.body.dataset.workspaceSurface = 'browser'
    expect(use('样例一')).toBe(true)
    expect(shell.setDraft).not.toHaveBeenCalled()

    doc.body.dataset.workspaceSurface = 'image-factory'
    expect(use('样例一')).toBe(false)
    expect(shell.snapshot.draft).toBe('用文字生成海报\n\n样例一')
    expect(use('样例二')).toBe(false)
    expect(shell.snapshot.draft).toBe('用文字生成海报\n\n样例二')
    expect(submit).not.toHaveBeenCalled()

    event('state', { messages: [], current: true })
    expect(use('样例三')).toBe(true)
    expect(shell.snapshot.draft).toBe('用文字生成海报\n\n样例二')
  } finally { binding.dispose(); await win.happyDOM.abort() }
})
