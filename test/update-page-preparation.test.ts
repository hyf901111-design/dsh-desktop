import { Window } from 'happy-dom'
import { expect, it, vi } from 'vitest'
import { requestUpdatePagePreparation } from '../src/preload/update-preparation'
import { createSettingsBackgroundController } from '../src/preload/settings-background'

it('waits for the correlated page persistence reply and propagates a real failure', async () => {
  const win = new Window(), doc = win.document as unknown as Document
  let request: { requestId: string; action: string } | undefined
  win.addEventListener('sherlock:boards:request', event => { request = (event as unknown as CustomEvent).detail })
  const reply = (id: string, ok: boolean, error?: string) => win.dispatchEvent(new win.CustomEvent('sherlock:boards:reply', { detail: { requestId: id, ok, error } }))
  let complete = false
  const first = requestUpdatePagePreparation(doc).then(() => { complete = true })
  expect(request?.action).toBe('prepare-update')
  reply('another-request', true)
  await Promise.resolve()
  expect(complete).toBe(false)
  reply(request!.requestId, true)
  await first
  const second = expect(requestUpdatePagePreparation(doc)).rejects.toThrow('草稿保存失败')
  reply(request!.requestId, false, '草稿保存失败')
  await second
  await win.happyDOM.close()
})

it('times out, releases the page input lock, and ignores a late persistence reply', async () => {
  const win = new Window(), doc = win.document as unknown as Document
  let expire!: () => void, requestId = ''
  vi.spyOn(win, 'setTimeout').mockImplementation(((callback: () => void) => { expire = callback; return 123 }) as unknown as typeof win.setTimeout)
  win.addEventListener('sherlock:boards:request', event => { requestId = (event as unknown as CustomEvent).detail.requestId })
  const resume = vi.fn()
  win.addEventListener('sherlock:boards:update-resume', resume)
  const result = expect(requestUpdatePagePreparation(doc)).rejects.toThrow('超时')
  expire()
  await result
  win.dispatchEvent(new win.CustomEvent('sherlock:boards:reply', { detail: { requestId, ok: true } }))
  expect(resume).toHaveBeenCalledOnce()
  vi.restoreAllMocks()
  await win.happyDOM.close()
})

it('preserves the actual nested settings host and restores pre-existing portals after close', async () => {
  const win = new Window(), doc = win.document
  doc.body.innerHTML = '<div><div class="pI_x6G_frame"><input value="draft"><aside><div class="hHd-Xa_root"><footer><div class="hHd-Xa_settingsArea"><div><div class="VOzbGW_overlay"></div></div></div></footer></div></aside></div></div><div data-portal-container><div role="menu" id="old-menu"></div></div>'
  const controller = createSettingsBackgroundController(doc as unknown as Document)
  const frame = doc.querySelector('.pI_x6G_frame'), draft = doc.querySelector('input')
  controller.reconcile()
  expect(doc.querySelector('#old-menu')?.hasAttribute('data-settings-background-portal')).toBe(true)
  const settingsMenu = doc.createElement('div'); settingsMenu.setAttribute('role', 'listbox'); doc.body.append(settingsMenu)
  controller.reconcile()
  expect(settingsMenu.hasAttribute('data-settings-background-portal')).toBe(false)
  doc.querySelector('.VOzbGW_overlay')!.remove()
  controller.reconcile()
  expect(doc.querySelector('#old-menu')?.hasAttribute('data-settings-background-portal')).toBe(false)
  expect(doc.querySelector('.pI_x6G_frame')).toBe(frame)
  expect(doc.querySelector('input')).toBe(draft)
  expect(draft?.value).toBe('draft')
  controller.dispose()
  await win.happyDOM.close()
})
