import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isHomeThemeSelection, normalizeHomeTheme, type HomeThemeSelection } from '../shared/home-themes'
import { registerTrustedMainWindowListener, type TrustedWindow, type TrustedWindowEvent } from './ipc-trust'
import { isFreshDesktopProfile } from './state/launch-root'

/** A desktop preference is independent of Harness's changing localhost port. */
export class HomeThemePreferenceStore {
  private readonly file: string
  constructor(private readonly userData: string) { this.file = join(userData, 'home-theme.json') }

  get(): HomeThemeSelection | null {
    try {
      if (statSync(this.file).size > 512) return null
      const saved: unknown = JSON.parse(readFileSync(this.file, 'utf8'))
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return null
      const record = saved as { version?: unknown; theme?: unknown }
      return record.version === 1 ? normalizeHomeTheme(record.theme) : null
    } catch { return null }
  }

  set(theme: unknown): boolean {
    if (!isHomeThemeSelection(theme)) return false
    const temporary = `${this.file}.${process.pid}.tmp`
    try {
      mkdirSync(this.userData, { recursive: true, mode: 0o700 })
      writeFileSync(temporary, `${JSON.stringify({ version: 1, theme })}\n`, { encoding: 'utf8', mode: 0o600, flush: true })
      renameSync(temporary, this.file)
      return true
    } catch {
      try { rmSync(temporary, { force: true }) } catch {}
      return false
    }
  }
}

export function initializeFirstLaunchAppearance(userData: string): void {
  const harness = join(userData, 'harness')
  if (!isFreshDesktopProfile(userData)) return
  mkdirSync(harness, { recursive: true, mode: 0o700 })
  writeFileSync(join(harness, 'settings.yaml'), 'ui-theme:\n  preference: dark\n', { flag: 'wx', mode: 0o600 })
  if (!existsSync(join(userData, 'home-theme.json'))) {
    new HomeThemePreferenceStore(userData).set('shashidhar')
  }
}

type PreferenceIpc = {
  removeAllListeners(channel: string): unknown
  on(channel: string, listener: (event: TrustedWindowEvent & { returnValue: unknown }, value?: unknown) => void): unknown
}

export function registerHomeThemePreferences(ipc: PreferenceIpc, getWindow: () => TrustedWindow | undefined, userData: string): void {
  const store = new HomeThemePreferenceStore(userData)
  // Tiny synchronous writes complete before a subsequent close/restart request.
  ipc.removeAllListeners('desktop-home-theme:get')
  registerTrustedMainWindowListener(ipc, 'desktop-home-theme:get', getWindow, () => store.get(), null)
  ipc.removeAllListeners('desktop-home-theme:set')
  registerTrustedMainWindowListener(ipc, 'desktop-home-theme:set', getWindow, (_event, value: unknown) => store.set(value), false)
}
