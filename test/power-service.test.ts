import {execFile} from 'node:child_process'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {promisify} from 'node:util'
import {afterEach, describe, expect, it} from 'vitest'
import {MacOSPowerService, parsePowerServiceStatus} from '../src/main/power/macos-power-service'

const run = promisify(execFile), roots: string[] = []
afterEach(() => {for (const path of roots.splice(0)) rmSync(path, {recursive: true, force: true})})
describe('one-time native power service installer', () => {
  it('rejects malformed or incompatible service status instead of trusting an enabled flag', () => {
    expect(parsePowerServiceStatus(JSON.stringify({version: 1, servicePid: 40, ownerPid: 0, token: null, mode: 'idle'})).mode).toBe('idle')
    for (const value of [{version: 2}, {version: 1, mode: 'active', servicePid: -1, ownerPid: 1, token: 'malformed'}, {version: 1, mode: 'arbitrary-command', servicePid: 40, ownerPid: 1, token: 'a'.repeat(32)}]) {
      expect(() => parsePowerServiceStatus(JSON.stringify(value))).toThrow()
    }
  })
  it('compiles the actual installer shell and AppleScript without executing privileged commands', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ew-power-install-')); roots.push(root)
    const helper = join(root, 'helper'), compiled = join(root, 'approval.scpt')
    writeFileSync(helper, 'unsigned fixture: never installed')
    let source = ''
    const service = new MacOSPowerService({helperSource: helper, run: async (file, args) => {
      expect(file).toBe('/usr/bin/osascript'); source = args[1] ?? ''
      throw Object.assign(Error('User canceled. (-128)'), {stderr: 'User canceled. (-128)'})
    }})
    await expect(service.install()).rejects.toThrow('authorization-cancelled')
    await run('/usr/bin/osacompile', ['-o', compiled, '-e', source])
    const shell: string = JSON.parse(/^do shell script ("(?:[^"\\]|\\.)*") with administrator/su.exec(source)![1]!)
    await run('/bin/sh', ['-n', '-c', shell])
  })
})
