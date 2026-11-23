import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

export function launchRootPath(userDataPath: string): string {
  return join(userDataPath, 'launch-root')
}

export function isFreshDesktopProfile(userData: string): boolean {
  return !existsSync(join(userData, 'harness')) && !existsSync(launchRootPath(userData))
}

export async function ensureLaunchRoot(userDataPath: string): Promise<string> {
  const launchRoot = launchRootPath(userDataPath)
  await mkdir(launchRoot, { recursive: true })
  return launchRoot
}
