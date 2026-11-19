import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeNavigationShortcuts, type NavigationShortcuts } from '../shared/navigation-shortcuts'
import { registerTrustedMainWindowListener, type TrustedWindow, type TrustedWindowEvent } from './ipc-trust'

type PreferenceIpc = {
  on(channel: string, listener: (event: TrustedWindowEvent & { returnValue: unknown }, value?: unknown) => void): unknown
}

export function registerNavigationShortcutPreferences(
  ipc: PreferenceIpc, getWindow: () => TrustedWindow | undefined, userData: string, getOwner: () => string | null
) {
  const directory = join(userData, 'navigation-shortcuts')
  const scope = () => {
    const owner = getOwner()
    return owner === null ? null : createHash('sha256').update(owner).digest('hex')
  }
  const fileFor = (key: string) => join(directory, key + '.json')
  registerTrustedMainWindowListener(ipc, 'navigation-shortcuts:get', getWindow, () => {
    const key = scope()
    if (!key) return null
    let config: NavigationShortcuts | undefined
    try {
      const file = fileFor(key)
      if (statSync(file).size <= 1024) config = normalizeNavigationShortcuts(JSON.parse(readFileSync(file, 'utf8')))
    } catch {}
    return { key, config: config ?? normalizeNavigationShortcuts(null) }
  }, null)
  registerTrustedMainWindowListener(ipc, 'navigation-shortcuts:set', getWindow, (_event, value: unknown) => {
    const input = value as { key?: unknown; config?: Partial<NavigationShortcuts> } | null
    const key = scope()
    if (!key || input?.key !== key || !Array.isArray(input.config?.top) || !Array.isArray(input.config?.side)) return false
    const file = fileFor(key)
    const temporary = file + '.tmp'
    try {
      mkdirSync(directory, { recursive: true, mode: 0o700 })
      writeFileSync(temporary, JSON.stringify(normalizeNavigationShortcuts(input.config)), { mode: 0o600, flush: true })
      renameSync(temporary, file)
      return true
    } catch {
      try { rmSync(temporary, { force: true }) } catch {}
      return false
    }
  }, false)
}
