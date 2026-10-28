import {describe, expect, it} from 'vitest'
import {registerPowerSettingsIpc} from '../src/main/power/ipc'

describe('power IPC authorization', () => {
  it('rejects child frames and foreign windows before invoking a power operation', async () => {
    const handlers = new Map<string, (...args: any[]) => any>()
    const ipc = {handle: (key: string, handler: (...args: any[]) => any) => handlers.set(key, handler), removeHandler: (key: string) => {handlers.delete(key)}}
    const webContents = {mainFrame: {processId: 7, routingId: 41}}
    const window = {webContents, isDestroyed: () => false}
    let calls = 0
    registerPowerSettingsIpc(ipc, () => window, {refresh: async () => {calls++}, set: async () => {calls++}})
    for (const senderFrame of [null, {processId: 7, routingId: 42}]) {
      expect(() => handlers.get('desktop-power:set')!({sender: webContents, senderFrame}, 'keepAwakeWhenLidClosed', true)).toThrow()
    }
    expect(() => handlers.get('desktop-power:get')!({sender: {}, senderFrame: webContents.mainFrame})).toThrow()
    expect(calls).toBe(0)
    await handlers.get('desktop-power:get')!({sender: webContents, senderFrame: {...webContents.mainFrame}})
    expect(calls).toBe(1)
  })
})
