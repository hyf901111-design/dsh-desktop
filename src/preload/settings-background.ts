/** Settings stays mounted inside the sidebar; conceal only the old visual surface. */
export function createSettingsBackgroundController(doc: Document) {
  let overlay: Element | null = null
  const portals = new Set<HTMLElement>()
  const restore = () => { portals.forEach(node => node.removeAttribute('data-settings-background-portal')); portals.clear() }
  return {
    reconcile() {
      const next = doc.querySelector('.VOzbGW_overlay')
      if (next === overlay) return
      restore()
      overlay = next
      if (!next) return
      // Menus opened later belong to settings. Only pre-existing external portals are concealed.
      doc.querySelectorAll<HTMLElement>('[role=menu], [role=listbox], [role=tooltip]').forEach(node => {
        if (!next.contains(node)) { portals.add(node); node.setAttribute('data-settings-background-portal', '') }
      })
    },
    dispose: restore
  }
}
