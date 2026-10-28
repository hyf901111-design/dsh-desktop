import {mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync, statSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import {MacOSLidGuard, parseSleepDisabled} from '../src/main/power/macos-lid-guard'
import type {PowerService, PowerServiceStatus} from '../src/main/power/macos-power-service'
import {PowerPreferenceStore, PowerSettingsController} from '../src/main/power/controller'

const roots: string[] = []
afterEach(() => {for (const path of roots.splice(0)) rmSync(path, {recursive: true, force: true})})
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'ew-power-service-')); roots.push(directory)
  let ready = false, installs = 0, mode: PowerServiceStatus['mode'] = 'active'
  const leasePath = join(directory, 'session.json')
  const service: PowerService = {directory,
    isReady: async () => ready,
    install: async () => {ready = true; installs++},
    status: async () => {
      if (!existsSync(leasePath)) return {version: 1, servicePid: 20, mode: 'idle', ownerPid: 0, token: null}
      const lease = JSON.parse(readFileSync(leasePath, 'utf8'))
      if (lease.release) return {version: 1, servicePid: 20, mode: 'idle', ownerPid: lease.pid, token: lease.token}
      return {version: 1, servicePid: 20, mode, ownerPid: lease.pid, token: lease.token}
    }
  }
  const run = async (file: string, args: string[]) => {
    if (file === '/bin/ps') return 'Wed Oct 28 10:00:00 2026\n'
    if (file === '/usr/bin/pmset') return args.length === 1 ? ` SleepDisabled ${existsSync(leasePath) && !JSON.parse(readFileSync(leasePath, 'utf8')).release ? 1 : 0}\n` : '80%; AC attached; not charging'
    throw Error('Unexpected command: ' + file)
  }
  return {directory, leasePath, service, run, installs: () => installs, installed: () => {ready = true}, mode: (value: PowerServiceStatus['mode']) => {mode = value}}
}

describe('persistent closed-lid service lease', () => {
  it('accepts only explicit system-wide SleepDisabled values', () => {
    expect(parseSleepDisabled(' SleepDisabled\t0\n')).toBe(false)
    expect(parseSleepDisabled(' SleepDisabled 1\n')).toBe(true)
    expect(() => parseSleepDisabled('sleep 0')).toThrow()
    expect(() => parseSleepDisabled('SleepDisabled 7')).toThrow()
  })
  it('installs once, releases its lease on quit, and reacquires on a new launch without authorization', async () => {
    const f = fixture(), first = new MacOSLidGuard({service: f.service, run: f.run})
    expect(await first.start(true)).toBe('active')
    expect(f.installs()).toBe(1)
    expect(statSync(f.leasePath).mode & 0o777).toBe(0o600)
    const firstLease = JSON.parse(readFileSync(f.leasePath, 'utf8'))
    expect(firstLease).toMatchObject({version: 1, pid: process.pid, started: 'Wed Oct 28 10:00:00 2026'})
    expect(firstLease.token).toMatch(/^[a-f0-9]{32}$/u)
    first.cancel()
    expect(JSON.parse(readFileSync(f.leasePath, 'utf8')).release).toBe(true)
    await first.stop()
    expect(existsSync(f.leasePath)).toBe(false)
    const next = new MacOSLidGuard({service: f.service, run: f.run})
    expect(await next.start(false)).toBe('active')
    expect(JSON.parse(readFileSync(f.leasePath, 'utf8')).token).not.toBe(firstLease.token)
    expect(f.installs()).toBe(1)
    await next.stop()
    expect(existsSync(f.leasePath)).toBe(false)
  })
  it('fails silently at automatic startup when the helper is missing and leaves no lease', async () => {
    const f = fixture(), guard = new MacOSLidGuard({service: f.service, run: f.run})
    await expect(guard.start(false)).rejects.toThrow('helper-unavailable')
    expect(f.installs()).toBe(0)
    expect(existsSync(f.leasePath)).toBe(false)
  })
  it('cancelling first installation creates neither an active lease nor a false enabled state', async () => {
    const f = fixture()
    f.service.install = async () => {throw Error('authorization-cancelled')}
    const guard = new MacOSLidGuard({service: f.service, run: f.run})
    await expect(guard.start(true)).rejects.toThrow('authorization-cancelled')
    expect(await guard.active()).toBe(false)
    expect(existsSync(f.leasePath)).toBe(false)
  })
  it('does not let an old client remove a newer client lease', async () => {
    const f = fixture(); f.installed()
    const old = new MacOSLidGuard({service: f.service, run: f.run})
    await old.start(false)
    const replacement = {...JSON.parse(readFileSync(f.leasePath, 'utf8')), token: 'a'.repeat(32)}
    writeFileSync(f.leasePath, JSON.stringify(replacement), {mode: 0o600})
    old.cancel()
    expect(JSON.parse(readFileSync(f.leasePath, 'utf8')).token).toBe(replacement.token)
  })
  it.each(['during-stop', 'after-ack'] as const)('preserves a replacement lease during automatic reacquisition: %s', async timing => {
    const f = fixture(); f.installed(); let inject = false
    let replacement = '', reads = 0
    const guard = new MacOSLidGuard({service: f.service, run: async (file,args) => {
      if (inject && file === '/bin/ps') {inject = false; writeFileSync(f.leasePath, replacement, {mode: 0o600, flag: 'wx'})}
      return f.run(file,args)
    }})
    try {
      await guard.start(false)
      replacement = JSON.stringify({...JSON.parse(readFileSync(f.leasePath, 'utf8')), pid: process.pid + 1, token: 'b'.repeat(32)}) + '\n'
      const status = f.service.status
      f.service.status = async () => {
        reads++
        if (timing === 'during-stop' && existsSync(f.leasePath) && JSON.parse(readFileSync(f.leasePath, 'utf8')).release) writeFileSync(f.leasePath, replacement, {mode: 0o600})
        return status()
      }
      await guard.stop()
      if (timing === 'after-ack') {expect(existsSync(f.leasePath)).toBe(false); inject = true}
      const previousReads = reads
      await expect(guard.start(false, true)).rejects.toThrow('lease-transferred')
      expect(readFileSync(f.leasePath, 'utf8')).toBe(replacement)
      expect(statSync(f.leasePath).nlink).toBe(1)
      expect(readdirSync(f.directory)).toEqual(['session.json'])
      expect(reads).toBe(previousReads)
      expect(f.installs()).toBe(0)
    } finally {guard.cancel(); await guard.stop()}
  })
  it('claims a new automatic nonce only after its old nonce is acknowledged, with a single link and no installation', async () => {
    const f = fixture(); f.installed()
    const guard = new MacOSLidGuard({service: f.service, run: f.run})
    const status = f.service.status
    f.service.status = async () => {
      if (existsSync(f.leasePath)) {
        expect(statSync(f.leasePath).nlink).toBe(1)
        expect(readdirSync(f.directory)).toEqual(['session.json'])
      }
      return status()
    }
    try {
      await guard.start(false)
      const first = JSON.parse(readFileSync(f.leasePath, 'utf8')).token
      await guard.stop(); expect(existsSync(f.leasePath)).toBe(false)
      expect(await guard.start(false, true)).toBe('active')
      expect(JSON.parse(readFileSync(f.leasePath, 'utf8')).token).not.toBe(first)
      expect(statSync(f.leasePath).nlink).toBe(1)
      expect(readdirSync(f.directory)).toEqual(['session.json'])
      expect(f.installs()).toBe(0)
    } finally {guard.cancel(); await guard.stop()}
  })
  it('preserves an external sleep policy when releasing its borrowed lease', async () => {
    const f = fixture(); f.installed(); f.mode('external')
    const guard = new MacOSLidGuard({service: f.service, run: f.run})
    expect(await guard.start(false)).toBe('external')
    await guard.stop()
    expect(existsSync(f.leasePath)).toBe(false)
  })
  it('reports safety stops and stops touching a lease that belongs to another launch', async () => {
    const f = fixture(); f.installed()
    const guard = new MacOSLidGuard({service: f.service, run: f.run})
    await guard.start(false)
    f.mode('safety-stop')
    await expect(guard.active()).rejects.toThrow('safety-stop')
    await guard.stop()
  })
  it('does not mistake a root recovery error with no token for successful restoration', async () => {
    const f = fixture(); f.installed()
    const guard = new MacOSLidGuard({service: f.service, run: f.run})
    await guard.start(false)
    const original = f.service.status
    f.service.status = async () => ({version: 1, servicePid: 20, mode: 'error', ownerPid: 0, token: null})
    await expect(guard.stop()).rejects.toThrow('restore-failed')
    f.service.status = original
    await expect(guard.stop()).resolves.toBeUndefined()
  })
  it('retains its lease when a temporary global service error has no token', async () => {
    const f = fixture(); f.installed()
    const guard = new MacOSLidGuard({service: f.service, run: f.run})
    await guard.start(false)
    const original = f.service.status
    f.service.status = async () => ({version: 1, servicePid: 20, mode: 'error', ownerPid: 0, token: null})
    await expect(guard.active()).rejects.toThrow('restore-failed')
    expect(JSON.parse(readFileSync(f.leasePath, 'utf8')).release).toBeUndefined()
    f.service.status = original
    await expect(guard.active()).resolves.toBe(true)
    await guard.stop()
  })
  it('retains its request when the service still reports active before publishing a restored power state', async () => {
    const f = fixture(); f.installed(); let restored = false
    const guard = new MacOSLidGuard({service: f.service, run: (file,args) => restored && file === '/usr/bin/pmset' ? Promise.resolve('SleepDisabled 0\n') : f.run(file,args)})
    await guard.start(false)
    restored = true
    await expect(guard.active()).rejects.toThrow('restore-failed')
    expect(JSON.parse(readFileSync(f.leasePath, 'utf8')).release).toBeUndefined()
    f.mode('system-changed')
    await expect(guard.active()).rejects.toThrow('system-changed')
    await guard.stop()
  })
  it('waits for its release nonce acknowledgement when acquisition was cancelled before active status', async () => {
    const f = fixture(); f.installed()
    const guard = new MacOSLidGuard({service: f.service, run: f.run})
    let releaseReads = 0
    f.service.status = async () => {
      const lease = JSON.parse(readFileSync(f.leasePath, 'utf8'))
      if (!lease.release) guard.cancel()
      else if (++releaseReads > 1) return {version: 1, servicePid: 20, mode: 'idle', ownerPid: lease.pid, token: lease.token}
      return {version: 1, servicePid: 20, mode: 'idle', ownerPid: 0, token: null}
    }
    await expect(guard.start(false)).rejects.toThrow('lid-unavailable')
    expect(releaseReads).toBe(2)
    expect(existsSync(f.leasePath)).toBe(false)
  })

  it('retires the actual old nonce before controller recovery creates a fresh lease without installing', async () => {
    const f = fixture(); f.installed()
    const guard = new MacOSLidGuard({service: f.service, run: f.run}), store = new PowerPreferenceStore(f.directory)
    const controller = new PowerSettingsController({store, guard, blocker: {start: () => 1, stop: () => true, isStarted: () => true}})
    await controller.set('keepAwakeWhenLidClosed', true)
    const first = JSON.parse(readFileSync(f.leasePath, 'utf8')).token
    const status = f.service.status
    let retired = false
    f.service.status = async () => {
      if (existsSync(f.leasePath) && JSON.parse(readFileSync(f.leasePath, 'utf8')).release) {retired = true; f.mode('active')}
      return status()
    }
    f.mode('system-changed')
    expect(await controller.refresh()).toMatchObject({keepAwakeWhenLidClosed: true, lidMode: 'active', error: null})
    expect(retired).toBe(true)
    expect(JSON.parse(readFileSync(f.leasePath, 'utf8')).token).not.toBe(first)
    expect(f.installs()).toBe(0)
    expect(store.getLid()).toBe(true)
    controller.dispose(); await guard.stop()
  })
})
