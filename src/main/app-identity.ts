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
