export type WorkspaceSidebars = { left: boolean; right: boolean }

export function setWorkspaceSidebars(doc: Document, target: WorkspaceSidebars): WorkspaceSidebars {
  const sidebar = doc.querySelector<HTMLElement>('[data-dsh-sidebar-root]')
  const right = doc.querySelector<HTMLButtonElement>('[data-odyssey-panel-entry="right"]')
  const previous = {
    left: sidebar?.dataset.dshSidebarWide === 'true',
    right: right?.getAttribute('aria-expanded') === 'true'
  }
  if (previous.left !== target.left) sidebar?.querySelector<HTMLButtonElement>('.hHd-Xa_toggle')?.click()
  if (previous.right !== target.right) right?.click()
  return previous
}
