import { Window } from 'happy-dom'
import { expect, it, vi } from 'vitest'
import { setWorkspaceSidebars } from '../src/preload/workspace-sidebars'

it.each([
  { left: true, right: true }, { left: true, right: false },
  { left: false, right: true }, { left: false, right: false }
])('restores the original workspace sidebars after focusing the canvas ($left, $right)', async original => {
  const window = new Window()
  try {
    const doc = window.document as unknown as Document
    doc.body.innerHTML = '<aside data-dsh-sidebar-root><button class="hHd-Xa_toggle"></button></aside>' +
      '<button data-odyssey-panel-entry="right"></button>'
    const sidebar = doc.querySelector<HTMLElement>('aside')!
    const right = doc.querySelector<HTMLButtonElement>('[data-odyssey-panel-entry=right]')!
    sidebar.dataset.dshSidebarWide = String(original.left)
    right.setAttribute('aria-expanded', String(original.right))
    const toggleLeft = vi.fn(() => { sidebar.dataset.dshSidebarWide = String(sidebar.dataset.dshSidebarWide !== 'true') })
    const toggleRight = vi.fn(() => right.setAttribute('aria-expanded', String(right.getAttribute('aria-expanded') !== 'true')))
    sidebar.querySelector('button')!.onclick = toggleLeft
    right.onclick = toggleRight

    const collapsed = { left: false, right: false }
    const saved = setWorkspaceSidebars(doc, collapsed)
    expect(saved).toEqual(original)
    expect(setWorkspaceSidebars(doc, collapsed)).toEqual(collapsed)
    expect(setWorkspaceSidebars(doc, saved)).toEqual(collapsed)
    expect(sidebar.dataset.dshSidebarWide).toBe(String(original.left))
    expect(right.getAttribute('aria-expanded')).toBe(String(original.right))
    expect(toggleLeft).toHaveBeenCalledTimes(original.left ? 2 : 0)
    expect(toggleRight).toHaveBeenCalledTimes(original.right ? 2 : 0)
  } finally {
    await window.happyDOM.close()
  }
})
