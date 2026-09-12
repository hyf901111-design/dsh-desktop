import { afterEach, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import { boardDialog, boardRolePicker } from '../src/preload/research-board-dialogs'
const windows: Window[] = []
afterEach(async () => { for (const w of windows.splice(0)) await w.happyDOM.abort() })
function fixture() {
  const w = new Window({ url: 'http://localhost/' }); windows.push(w)
  const d = boardDialog(w.document as unknown as Document, '管理协作')
  const picker = boardRolePicker(w.document as unknown as Document, '邀请权限', 'editor')
  d.body.append(picker)
  const change = vi.fn(); picker.addEventListener('change', change)
  const key = (value: string) => w.document.activeElement!.dispatchEvent(new w.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }))
  return { w, d, picker, change, key, menu: () => w.document.querySelector('.srb-role-menu')! as unknown as HTMLElement }
}
it('opens described radio options inside the dialog top layer without changing the role, then commits once', () => {
  const f = fixture(); f.picker.click()
  expect(f.menu().parentElement).toBe(f.d.dialog)
  expect(f.menu().getAttribute('popover')).toBe('manual')
  expect(f.menu().querySelectorAll('[role=menuitemradio]')).toHaveLength(2)
  expect(f.menu().textContent).toContain('查看并编辑画板中的内容。')
  expect(f.menu().textContent).toContain('查看画板内容，不能进行编辑。')
  expect(f.change).not.toHaveBeenCalled()
  f.key('ArrowDown'); f.key('Enter')
  expect(f.picker.value).toBe('viewer'); expect(f.change).toHaveBeenCalledTimes(1)
  expect(f.menu()).toBeNull(); expect(f.w.document.activeElement).toBe(f.picker)
  f.picker.click(); f.key('Enter')
  expect(f.change).toHaveBeenCalledTimes(1)
})
it('Escape closes only the menu, restores focus and does not cancel the dialog', () => {
  const f = fixture(); const cancel = vi.fn(); f.d.dialog.addEventListener('cancel', cancel)
  f.picker.click(); const event = new f.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  f.w.document.activeElement!.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true); expect(cancel).not.toHaveBeenCalled()
  expect(f.menu()).toBeNull(); expect(f.d.dialog.open).toBe(true)
  expect(f.w.document.activeElement).toBe(f.picker); expect(f.change).not.toHaveBeenCalled()
})
it('blocks disabled and busy controls and dismisses on outside pointer or removal', async () => {
  const f = fixture(); f.picker.disabled = true; f.picker.click(); expect(f.menu()).toBeNull()
  f.picker.disabled = false; f.d.body.inert = true; f.picker.click(); expect(f.menu()).toBeNull()
  f.d.body.inert = false; f.picker.click()
  f.d.body.dispatchEvent(new f.w.PointerEvent('pointerdown', { bubbles: true }) as unknown as Event)
  expect(f.menu()).toBeNull(); expect(f.change).not.toHaveBeenCalled()
  f.picker.click(); f.picker.remove(); await new Promise(resolve => setTimeout(resolve, 0))
  expect(f.menu()).toBeNull()
})
it('right-aligns with an eight pixel gap and flips/clamps at window edges', () => {
  const f = fixture()
  vi.spyOn(f.picker, 'getBoundingClientRect').mockReturnValue(new f.w.DOMRect(900, 50, 88, 30) as unknown as DOMRect)
  f.picker.click(); expect(f.menu().style.left).toBe('708px'); expect(f.menu().style.top).toBe('88px')
  f.picker.click()
  vi.spyOn(f.picker, 'getBoundingClientRect').mockReturnValue(new f.w.DOMRect(0, 700, 88, 30) as unknown as DOMRect)
  f.picker.click(); expect(f.menu().style.left).toBe('12px'); expect(f.menu().style.top).toBe('550px')
})
