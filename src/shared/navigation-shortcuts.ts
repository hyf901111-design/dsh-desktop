export const navigationApps = ['browser', 'knowledge', 'image-factory', 'plugin', 'scheduled', 'research', 'note', 'spreadsheet'] as const
export const navigationSlotCount = 4

export type NavigationApp = typeof navigationApps[number]
export type NavigationRegion = 'top' | 'side'
export type NavigationShortcuts = Record<NavigationRegion, readonly (NavigationApp | null)[]>

export const defaultNavigationShortcuts: NavigationShortcuts = {
  top: ['research', 'note', 'spreadsheet', null],
  side: ['browser', 'image-factory', 'knowledge', null]
}

export function isNavigationApp(value: unknown): value is NavigationApp {
  return navigationApps.some(app => app === value)
}

export function normalizeNavigationShortcuts(value: unknown): NavigationShortcuts {
  const record = value as Partial<Record<NavigationRegion, unknown>> | null
  const slots = (region: NavigationRegion) => {
    const saved = record?.[region]
    if (!Array.isArray(saved)) return [...defaultNavigationShortcuts[region]]
    const used = new Set<NavigationApp>()
    return Array.from({ length: navigationSlotCount }, (_, index) => {
      const app: unknown = saved[index]
      if (!isNavigationApp(app) || used.has(app)) return null
      used.add(app)
      return app
    })
  }
  return { top: slots('top'), side: slots('side') }
}

export function replaceNavigationShortcut(
  value: NavigationShortcuts, region: NavigationRegion, index: number, app: NavigationApp | null
): NavigationShortcuts {
  const slots = value[region]
  if (!Number.isInteger(index) || index < 0 || index >= navigationSlotCount || slots[index] === app) return value
  const next = [...slots]
  const current = app === null ? -1 : slots.indexOf(app)
  if (current >= 0) next[current] = slots[index] ?? null
  next[index] = app
  return { ...value, [region]: next }
}
