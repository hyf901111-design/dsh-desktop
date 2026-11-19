export const navigationApps = ['browser', 'knowledge', 'image-factory', 'plugin', 'scheduled', 'research', 'note', 'spreadsheet'] as const
export const topShortcutCount = 4
export const workspaceContentViews = ['research', 'notes', 'spreadsheet', 'image-factory', 'browser', 'knowledge'] as const
export type WorkspaceContentView = typeof workspaceContentViews[number]
export const topNavigationApps = ['research', 'note', 'spreadsheet', 'image-factory', 'browser', 'knowledge'] as const
export type TopNavigationApp = typeof topNavigationApps[number]
export function isTopNavigationApp(value: unknown): value is TopNavigationApp {
  return topNavigationApps.some(app => app === value)
}
export const sidebarShortcutCount = 6

export type NavigationApp = typeof navigationApps[number]
const sidebarActions = ['new-workspace', 'new-chat'] as const
export type NavigationShortcut = NavigationApp | typeof sidebarActions[number]
export type NavigationRegion = 'top' | 'side'
export type NavigationShortcuts = Record<NavigationRegion, readonly (NavigationShortcut | null)[]>

export const defaultNavigationShortcuts: NavigationShortcuts = {
  top: ['research', 'note', 'spreadsheet', null],
  side: ['research', 'spreadsheet', 'browser', 'note', 'knowledge', 'image-factory']
}

export function isNavigationApp(value: unknown): value is NavigationApp {
  return navigationApps.some(app => app === value)
}

export function isNavigationShortcut(value: unknown): value is NavigationShortcut {
  return isNavigationApp(value) || sidebarActions.some(action => action === value)
}

function compactSidebar(slots: readonly (NavigationShortcut | null)[]) {
  const occupied = slots.filter(app => app !== null)
  return Array.from({ length: sidebarShortcutCount }, (_, index) => occupied[index] ?? null)
}

export function normalizeNavigationShortcuts(value: unknown): NavigationShortcuts {
  const record = value as Partial<Record<NavigationRegion, unknown>> | null
  const slots = (region: NavigationRegion) => {
    const saved = record?.[region]
    if (!Array.isArray(saved)) return [...defaultNavigationShortcuts[region]]
    const used = new Set<NavigationShortcut>()
    return Array.from({ length: region === 'side' ? sidebarShortcutCount : topShortcutCount }, (_, index) => {
      const app: unknown = saved[index]
      if (!isNavigationShortcut(app) || (region === 'top' && !isNavigationApp(app)) || used.has(app)) return null
      used.add(app)
      return app
    })
  }
  return { top: slots('top'), side: compactSidebar(slots('side')) }
}

export function replaceNavigationShortcut(
  value: NavigationShortcuts, region: NavigationRegion, index: number, app: NavigationShortcut | null
): NavigationShortcuts {
  if (!Number.isInteger(index) || index < 0 || index >= (region === 'side' ? sidebarShortcutCount : topShortcutCount)) return value
  if (region === 'top') {
    if (app !== null && !isTopNavigationApp(app)) return value
    const ordered = value.top.filter(isTopNavigationApp)
    const from = app === null ? index : ordered.indexOf(app)
    if (from >= 0) ordered.splice(from, 1)
    if (app !== null) ordered.splice(index, 0, app)
    const top = Array.from({ length: topShortcutCount }, (_, position) => ordered[position] ?? null)
    return top.every((slot, position) => value.top[position] === slot) ? value : { ...value, top }
  }
  const slots = value.side
  if (slots[index] === app) return value
  const next = [...slots]
  const current = app === null ? -1 : slots.indexOf(app)
  if (current >= 0) next[current] = slots[index] ?? null
  next[index] = app
  return { ...value, side: compactSidebar(next) }
}
