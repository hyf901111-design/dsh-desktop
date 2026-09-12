import type { MenuItemConstructorOptions } from 'electron'

const supported = new Set(['open-new-tab', 'open-side', 'download', 'finder', 'relative', 'absolute'])

/** Display only; selected IDs return to the existing file-tree action handlers. */
export function buildNativeFileMenu(
  value: unknown,
  choose: (id: string) => void
): MenuItemConstructorOptions[] {
  if (!Array.isArray(value) || value.length > 6) return []
  const seen = new Set<string>()
  return value.flatMap((item: unknown) => {
    if (item === null || typeof item !== 'object') return []
    const { id, label, disabled } = item as Record<string, unknown>
    if (typeof id !== 'string' || !supported.has(id) || seen.has(id) ||
        typeof label !== 'string' || label.length === 0 || label.length > 120) return []
    seen.add(id)
    return [{ id, label, enabled: disabled !== true, click: () => choose(id) }]
  })
}
