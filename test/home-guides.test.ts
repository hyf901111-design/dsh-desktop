// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { mountHomeGuides } from '../src/preload/home-guides'

let dispose = () => {}
afterEach(() => { dispose(); document.body.innerHTML = ''; vi.useRealTimers() })
function fixture() {
  document.body.innerHTML = '<div class="pI_x6G_centerCol"><div class="wSkVaW_root"><header data-srb-session-header data-ework-notes-session="session-a"><button>原标签页</button></header><textarea>原有草稿</textarea></div></div>'
  const text = document.querySelector('textarea')!
  text.focus(); text.setSelectionRange(1, 3)
  const runStep = vi.fn(async () => {})
  const release = vi.fn()
  const adapters = { mountNotes: vi.fn(async () => ({ runStep, dispose: release })), mountPresentation: vi.fn(async () => ({ runStep, dispose: release })) }
  const controller = mountHomeGuides(document, adapters)
  dispose = controller.dispose
  return { controller, adapters, runStep, release, text }
}

test('keeps the resident input and restores its draft and selection on exit', async () => {
  const { controller, text, release } = fixture()
  await controller.start('note')
  expect(document.querySelector('[data-home-guide]')).not.toBeNull()
  expect(document.querySelector('textarea')).toBe(text); expect(text.value).toBe('原有草稿')
  controller.reset()
  expect(release).toHaveBeenCalledTimes(1)
  expect(document.querySelector('[data-home-guide]')).toBeNull()
  expect(document.activeElement).toBe(text); expect([text.selectionStart, text.selectionEnd]).toEqual([1, 3])
})

test('cancels late adapter mounts without stealing focus across a session change', async () => {
  const { controller, adapters, text } = fixture()
  let resolve!: (value: any) => void
  const lateDispose = vi.fn()
  adapters.mountNotes.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const start = controller.start('note')
  document.querySelector<HTMLElement>('[data-ework-notes-session]')!.dataset.eworkNotesSession = 'session-b'
  window.dispatchEvent(new CustomEvent('sherlock:home-action-context-changed', { detail: { sessionId: 'session-b' } }))
  const other = document.createElement('button'); document.body.append(other); other.focus()
  resolve({ runStep: async () => {}, dispose: lateDispose })
  await expect(start).rejects.toMatchObject({ name: 'AbortError' })
  expect(lateDispose).toHaveBeenCalledTimes(1)
  expect(document.activeElement).toBe(other); expect(text.value).toBe('原有草稿')
})

test('Escape closes the guide and repeat starts dispose the old run', async () => {
  const { controller, release, adapters } = fixture()
  await controller.start('note')
  await controller.start('ppt')
  expect(release).toHaveBeenCalledTimes(1)
  expect(adapters.mountPresentation).toHaveBeenCalledTimes(1)
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  expect(release).toHaveBeenCalledTimes(2)
  expect(document.querySelectorAll('[data-home-guide]')).toHaveLength(0)
})

test('uses the real mode tabs and replays without losing the original view', async () => {
  const { controller } = fixture()
  const header = document.querySelector('header')!
  header.innerHTML = '<div data-srb-tabs><button data-conversation-view-id="chat" aria-selected="true">对话</button><button data-conversation-view-id="notes" aria-selected="false">笔记</button></div>'
  for (const button of header.querySelectorAll('button')) button.addEventListener('click', () => {
    for (const tab of header.querySelectorAll('button')) tab.setAttribute('aria-selected', String(tab === button))
  })
  await controller.start('note')
  expect(header.querySelector('[data-conversation-view-id=notes]')?.getAttribute('aria-selected')).toBe('true')
  await controller.start('note')
  controller.reset()
  expect(header.querySelector('[data-conversation-view-id=chat]')?.getAttribute('aria-selected')).toBe('true')
})

test('keeps an actionable error surface if a native adapter cannot mount', async () => {
  const { controller, adapters } = fixture()
  adapters.mountNotes.mockRejectedValueOnce(Error('原生界面尚未就绪'))
  await controller.start('note').catch(() => {})
  expect(document.querySelector('[data-home-guide] [role=status]')?.textContent).toBe('原生界面尚未就绪')
  expect([...document.querySelectorAll<HTMLButtonElement>('[data-home-guide] button')].find(button => button.textContent === '重播')?.disabled).toBe(false)
  controller.reset()
})

test('identity cancellation leaves the new account interface focused', async () => {
  const { controller, text } = fixture()
  await controller.start('note')
  const dialog = document.createElement('button'); document.body.append(dialog); dialog.focus()
  controller.reset(false)
  expect(document.activeElement).toBe(dialog)
  expect(document.querySelector('[data-home-guide]')).toBeNull()
  expect(text.value).toBe('原有草稿')
})
