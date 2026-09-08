import { isAbsolute, join, normalize } from 'node:path'

export interface DesktopIdentity {
  name: 'EWork Odyssey' | 'EWork Odyssey Dev'
  userData: string
}

export type DesktopChannel = 'development' | 'legacy' | 'legacy-bridge' | 'notarized'

export function resolveDesktopIdentity(
  appDataPath: string,
  channel: DesktopChannel,
  explicitUserDataPath: string
): DesktopIdentity {
  const name = channel === 'development' ? 'EWork Odyssey Dev' : 'EWork Odyssey'
  const defaultDirectory =
    channel === 'development'
      ? 'dsh-desktop-dev'
      : channel === 'notarized' || channel === 'legacy-bridge'
        ? 'sherlock-desktop'
        : 'dsh-desktop'
  const explicitPath = explicitUserDataPath.trim()

  if (explicitPath && !isAbsolute(explicitPath)) {
    throw new Error('The EWork Odyssey user-data path must be absolute.')
  }

  return {
    name,
    userData: explicitPath ? normalize(explicitPath) : join(appDataPath, defaultDirectory)
  }
}

// Electron 43 captures the macOS Keychain/Linux secret-store name in
// PostCreateMainMessageLoop, before ready. Keep that stable for existing encrypted
// account sessions and cookies, then restore the public name before any window.
// https://github.com/electron/electron/blob/v43.4.0/shell/browser/electron_browser_main_parts.cc
export function configureDesktopName(
  host: { setName(name: string): void; once(event: 'ready', listener: () => void): unknown },
  name: DesktopIdentity['name'],
  platform: NodeJS.Platform = process.platform
): void {
  if (platform === 'darwin' || platform === 'linux') {
    host.setName(name === 'EWork Odyssey Dev' ? 'Sherlock Dev' : 'Sherlock')
    host.once('ready', () => host.setName(name))
  } else {
    host.setName(name)
  }
}
