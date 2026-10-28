import {describe, expect, it, vi} from 'vitest'

vi.mock('node:fs', async importOriginal => ({
  ...await importOriginal<typeof import('node:fs')>(),
  lstatSync: () => ({uid: 0, mode: 0o100755, isFile: () => true, isDirectory: () => false})
}))
import {MacOSPowerService} from '../src/main/power/macos-power-service'

describe('running power helper implementation readiness', () => {
  it.each([undefined, 1, 2])('checks daemon implementation %s independently of the replacement binary on disk', async implementationVersion => {
    const service = new MacOSPowerService({run: async (_file, args) => {
      if (args[0] === '--version') return '2\n'
      if (args[0] === 'print') return 'state = running\n pid = 20\n'
      return ''
    }})
    service.status = async () => ({version: 1, implementationVersion, servicePid: 20, mode: 'idle', ownerPid: 0, token: null})
    expect(await service.isReady()).toBe(implementationVersion === 2)
  })
})
