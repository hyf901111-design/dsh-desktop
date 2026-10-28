import {execFile, spawn} from 'node:child_process'
import {mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, utimesSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {promisify} from 'node:util'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {buildLidGuardScript, parseSleepDisabled, MacOSLidGuard} from '../src/main/power/macos-lid-guard'

const run = promisify(execFile)
const roots: string[] = []
afterEach(() => {for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true})})
function root() {const path = mkdtempSync(join(tmpdir(), 'lid-guard-test-')); roots.push(path); return path}

describe('macOS closed-lid guard', () => {
  it('only accepts an explicit system-wide SleepDisabled state', () => {
    expect(parseSleepDisabled('System-wide power settings:\n SleepDisabled\t\t0\nCurrently in use:\n sleep 0')).toBe(false)
    expect(parseSleepDisabled(' SleepDisabled 1\n')).toBe(true)
    expect(() => parseSleepDisabled('sleep 0')).toThrow()
    expect(() => parseSleepDisabled('SleepDisabled 7')).toThrow()
  })
  it('preserves an externally disabled sleep policy without administrator access or restoring it to zero', async () => {
    const commands: string[] = []
    const guard = new MacOSLidGuard({run: async (file) => {commands.push(file); if (file !== '/usr/bin/pmset') throw Error('must not elevate'); return ' SleepDisabled 1\n'}})
    expect(await guard.start()).toBe('external')
    expect(await guard.active()).toBe(true)
    await guard.stop()
    expect(commands.every(command => command === '/usr/bin/pmset')).toBe(true)
  })
  it('cancelling authorization removes the private lease and exposes a cancellation code', async () => {
    const guard = new MacOSLidGuard({run: async (file) => {
      if (file === '/usr/bin/pmset') return ' SleepDisabled 0\n'
      if (file === '/bin/ps') return 'Wed Oct 28 10:00:00 2026\n'
      throw Object.assign(Error('User canceled. (-128)'), {stderr: 'User canceled. (-128)'})
    }})
    await expect(guard.start()).rejects.toThrow('authorization-cancelled')
    expect(await guard.active()).toBe(false)
    await guard.stop()
  })
  it('compiles the real administrator AppleScript and shell without executing privileged commands', async () => {
    let source = ''
    const guard = new MacOSLidGuard({run: async (file, args) => {
      if (file === '/usr/bin/pmset') return args.length === 1 ? ' SleepDisabled 0\n' : 'Now drawing from AC Power\n80%; AC attached; not charging'
      if (file === '/bin/ps') return 'Wed Oct 28 10:00:00 2026\n'
      source = args[1] ?? ''; throw Error('stop before executing')
    }})
    await expect(guard.start()).rejects.toThrow('lid-unavailable')
    const path = root()
    await run('/usr/bin/osacompile', ['-o', join(path, 'approval.scpt'), '-e', source])
    const shell = JSON.parse(/^do shell script ("(?:[^"\\]|\\.)*") with administrator/su.exec(source)![1]!)
    await run('/bin/sh', ['-n', '-c', shell])
  })
  it('refuses to disable sleep on a nearly empty discharging battery', async () => {
    const guard = new MacOSLidGuard({run: async (file, args) => {
      expect(file).toBe('/usr/bin/pmset')
      return args.length === 1 ? ' SleepDisabled 0\n' : ' -InternalBattery-0 3%; discharging; 0:10 remaining'
    }})
    await expect(guard.start()).rejects.toThrow('safety-stop')
    expect(await guard.active()).toBe(false)
  })
  it('recovers its inactive root plist after an interrupted installation so the next authorization can retry', async () => {
    let source = ''
    const guard = new MacOSLidGuard({run: async (file, args) => {
      if (file === '/usr/bin/pmset') return args.length === 1 ? ' SleepDisabled 0\n' : '80%; AC attached; not charging'
      if (file === '/bin/ps') return 'Wed Oct 28 10:00:00 2026\n'
      source = args[1] ?? ''; throw Error('capture')
    }})
    await expect(guard.start()).rejects.toThrow()
    const path = root(), plist = join(path, 'stale.plist'), lease = join(path, 'active'), pmset = join(path, 'pmset'), stat = join(path, 'stat'), launchctl = join(path, 'launchctl')
    writeFileSync(plist, '<partial from interrupted installation>'); writeFileSync(lease, '')
    writeFileSync(pmset, '#!/bin/sh\nprintf " SleepDisabled 0\\n"\n', {mode: 0o700})
    writeFileSync(stat, '#!/bin/sh\nprintf "0\\n"\n', {mode: 0o700})
    writeFileSync(launchctl, '#!/bin/sh\n[ "$1" = print ] && exit 1\nexit 0\n', {mode: 0o700})
    const shell: string = JSON.parse(/^do shell script ("(?:[^"\\]|\\.)*") with administrator/su.exec(source)![1]!)
    const sandboxed = shell.replaceAll('/Library/LaunchDaemons/com.evanarts.sherlock.sleep-guard.plist', plist)
      .replaceAll('/usr/bin/pmset', pmset).replaceAll('/usr/bin/stat', stat).replaceAll('/bin/launchctl', launchctl)
      .replace(/\[ -f '[^']*\/active' \]/u, `[ -f '${lease}' ]`)
    expect((await run('/bin/sh', ['-c', sandboxed])).stdout).toBe('active')
    expect(readFileSync(plist, 'utf8')).toContain('<key>ProgramArguments</key>')
  })
  it.each(['removed', 'expired', 'wrong-process'] as const)('restores sleep when the lease is %s using the actual generated guard', async reason => {
    const path = root(), lease = join(path, 'lease'), plist = join(path, 'job.plist'), log = join(path, 'commands')
    writeFileSync(lease, ''); writeFileSync(plist, '')
    const started = (await run('/bin/ps', ['-p', String(process.pid), '-o', 'lstart='])).stdout.trim()
    const pmset = join(path, 'pmset'), launchctl = join(path, 'launchctl')
    writeFileSync(pmset, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$POWER_TEST_LOG"\n', {mode: 0o700})
    writeFileSync(launchctl, '#!/bin/sh\nexit 0\n', {mode: 0o700})
    let script = buildLidGuardScript({lease, pid: process.pid, started: reason === 'wrong-process' ? 'previous launch' : started, plist})
    script = script.replaceAll('/usr/bin/pmset', pmset).replaceAll('/bin/launchctl', launchctl).replaceAll('/bin/sleep 1', '/bin/sleep 0.02')
    const child = spawn('/bin/sh', ['-c', script], {env: {...process.env, POWER_TEST_LOG: log}, stdio: 'pipe'})
    const completion = new Promise<number|null>((resolve, reject) => {child.once('error', reject); child.once('exit', resolve)})
    try {
      if (reason !== 'wrong-process') {
        await vi.waitFor(() => expect(existsSync(log) && readFileSync(log, 'utf8')).toContain('-a disablesleep 1'))
        if (reason === 'removed') rmSync(lease)
        else utimesSync(lease, new Date(0), new Date(0))
      }
      expect(await completion).toBe(0)
      const lines = readFileSync(log, 'utf8').trim().split('\n')
      expect(lines.at(-1)).toBe('-a disablesleep 0')
      if (reason === 'wrong-process') expect(lines).toEqual(['-a disablesleep 0'])
      expect(existsSync(plist)).toBe(false)
    } finally {child.kill('SIGKILL')}
  })
  it('quotes lease paths as data so shell metacharacters cannot execute', async () => {
    const path = root(), injected = join(path, 'injected')
    const script = buildLidGuardScript({lease: `${path}/'$(touch ${injected})`, pid: process.pid, started: 'missing', plist: join(path, 'absent')})
      .replaceAll('/usr/bin/pmset', '/usr/bin/true').replaceAll('/bin/launchctl', '/usr/bin/true')
    await run('/bin/sh', ['-c', script])
    expect(existsSync(injected)).toBe(false)
  })
})
