import { Window } from 'happy-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { ScheduledTaskView } from '../src/preload/scheduled/view'
const windows: Window[] = []
afterEach(() => {
  windows.forEach((w) => w.happyDOM.abort())
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
it('provides only scheduled tasks in More, closes on Escape, and preserves the workspace on return', async () => {
  vi.useFakeTimers()
  const w = new Window()
  windows.push(w)
  vi.stubGlobal('MutationObserver', w.MutationObserver)
  vi.stubGlobal('CustomEvent', w.CustomEvent)
  const doc = w.document as unknown as Document
  doc.body.innerHTML =
    '<div data-dsh-sidebar-root><div class="hHd-Xa_newSessionGroup"><button class="hHd-Xa_newSession">新对话</button><button class="hHd-Xa_newSession">新研究</button></div></div><div class="pI_x6G_centerCol"><textarea>原草稿</textarea></div><div data-scheduled-panel-slot></div>'
  const bridge = {
    list: vi.fn(async () => []),
    workspaces: vi.fn(async () => [{ workspaceId: 'w', path: '/tmp/test' }]),
    save: vi.fn(),
    action: vi.fn(),
  }
  const view = new ScheduledTaskView(doc, bridge)
  view.mount()
  doc.querySelector<HTMLButtonElement>('.st-more')!.click()
  expect(doc.querySelectorAll('[role=menuitem]')).toHaveLength(1)
  expect(doc.querySelector('[role=menuitem]')!.textContent).toBe('定时任务')
  doc.dispatchEvent(
    new w.KeyboardEvent('keydown', { key: 'Escape' }) as unknown as Event,
  )
  expect(doc.querySelector('.st-menu')).toBeNull()
  await view.open()
  expect(doc.querySelector<HTMLElement>('.pI_x6G_centerCol')!.inert).toBe(true)
  doc.querySelector<HTMLButtonElement>('.st-new')!.click()
  const name = doc.querySelector<HTMLInputElement>('.st-detail-title')!
  name.value = '保留未提交任务'
  name.dispatchEvent(
    new w.Event('input', { bubbles: true }) as unknown as Event,
  )
  expect(doc.querySelector('.st-panel-toggle')).toBeNull()
  expect(doc.querySelector('.st-collapse')).toBeNull()
  expect(name.closest('[data-scheduled-panel-slot]')).not.toBeNull()
  for (const open of [false, true]) w.dispatchEvent(new w.CustomEvent('sherlock:scheduled-panel-toggle', {detail:{open}}))
  expect(doc.querySelector<HTMLInputElement>('.st-detail-title')!.value).toBe(
    '保留未提交任务',
  )
  view.close()
  expect(doc.querySelector<HTMLElement>('.pI_x6G_centerCol')!.inert).toBe(false)
  expect(doc.querySelector('textarea')!.value).toBe('原草稿')
})
