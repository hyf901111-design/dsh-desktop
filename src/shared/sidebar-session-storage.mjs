export const sidebarVisitsKey = 'ework.sidebar.visits.v1'

// These two helpers are also embedded in the native sidebar plugin.
export function readSidebarViewMode(win, key) {
  let local
  try { local = win.localStorage.getItem(key) } catch {}
  try {
    const store = win.dshDesktop?.researchCanvasStorage
    const saved = store?.getItem(key)
    if (saved === 'recent' || saved === 'directory') return saved
    if (local === 'recent' || local === 'directory') store?.setItem(key, local)
  } catch {}
  return local === 'recent' ? 'recent' : 'directory'
}

export function writeSidebarViewMode(win, key, mode) {
  try { win.dshDesktop?.researchCanvasStorage?.setItem(key, mode) } catch {}
  try { win.localStorage.setItem(key, mode) } catch {}
}

export function parseSidebarVisits(raw) {
  if (typeof raw !== 'string') return null
  try {
    const rows = JSON.parse(raw)
    if (!Array.isArray(rows) || !rows.every(entry => Array.isArray(entry) && entry.length === 2 &&
      typeof entry[0] === 'string' && entry[0].length > 0 && entry[0].length <= 1024 &&
      Number.isSafeInteger(entry[1]) && entry[1] > 0)) return null
    return rows
  } catch { return null }
}
