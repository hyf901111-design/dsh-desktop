import { app } from 'electron'
import { createRequire } from 'node:module'
import { join } from 'node:path'

export interface WindowCapture {
  start(pid: number, windowId: number, freshAfterMs?: number): Promise<{ data: Buffer; width: number; height: number; windowBounds: { x: number; y: number; width: number; height: number } }>
  stop(): Promise<void>
  state(): { active: boolean; stoppedBySystem: boolean }
}

let loaded: WindowCapture | undefined
export function createWindowCapture(): WindowCapture {
  if (!loaded) {
    const path = join(app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'build'), 'native', 'computer-capture.node')
    loaded = createRequire(import.meta.url)(path) as WindowCapture
  }
  return loaded
}
