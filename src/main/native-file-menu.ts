import type { MenuItemConstructorOptions } from 'electron'

const supported = new Set(['open-new-tab', 'open-side', 'default-app', 'download', 'finder', 'relative', 'absolute'])

/** 仅展示菜单；文件树和交付卡片的动作 ID 交回调用者，菜单自身不打开文件。 */
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
