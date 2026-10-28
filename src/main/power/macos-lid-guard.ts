import {randomBytes} from 'node:crypto'
import {lstatSync, openSync, fstatSync, futimesSync, closeSync, constants, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {setTimeout as delay} from 'node:timers/promises'
import type {LidGuard} from './controller'
import {MacOSPowerService, runPowerCommand, type PowerCommand, type PowerService, type PowerServiceStatus} from './macos-power-service'

type Lease = {version: 1; pid: number; started: string; token: string; release?: boolean}

export function parseSleepDisabled(output: string): boolean {
  const match = /^\s*SleepDisabled\s+([01])\s*$/mu.exec(output)
  if (!match) throw Error('System sleep state unavailable')
  return match[1] === '1'
}

/** One unprivileged lease; the installed native service owns all pmset writes. */
export class MacOSLidGuard implements LidGuard {
  private readonly service: PowerService
  private readonly run: PowerCommand
  private readonly file: string
  private token: string | undefined
  private lease: Lease | undefined
  private retiring: Lease | undefined
  private heartbeat: ReturnType<typeof setInterval> | undefined
  private generation = 0
  constructor(options: {service?: PowerService; run?: PowerCommand; helperSource?: string} = {}) {
    this.service = options.service ?? new MacOSPowerService({helperSource: options.helperSource, run: options.run})
    this.run = options.run ?? runPowerCommand
    this.file = join(this.service.directory, 'session.json')
  }
  async start(allowAuthorization = true): Promise<'active'|'external'> {
    if (this.retiring) await this.stop()
    if (this.token) {if (await this.active()) return (await this.service.status()).mode as 'active'|'external'; await this.stop()}
    const generation = ++this.generation
    if (!await this.service.isReady()) {
      if (!allowAuthorization) throw Error('helper-unavailable')
      await this.service.install()
    }
    if (generation !== this.generation) throw Error('lid-unavailable')
    const directory = lstatSync(this.service.directory)
    if (!directory.isDirectory() || directory.uid !== process.getuid?.() || (directory.mode & 0o077) !== 0) throw Error('helper-unavailable')
    const started = (await this.run('/bin/ps', ['-p', String(process.pid), '-o', 'lstart='])).trim()
    if (!started || generation !== this.generation) throw Error('lid-unavailable')
    const token = this.token = randomBytes(16).toString('hex')
    this.lease = {version: 1, pid: process.pid, started, token}
    const temporary = join(this.service.directory, `session.${token}.tmp`)
    try {
      writeFileSync(temporary, JSON.stringify(this.lease) + '\n', {mode: 0o600, flush: true, flag: 'wx'})
      renameSync(temporary, this.file)
      this.heartbeat = setInterval(() => {try {
        if (this.ownsLease()) {
          const descriptor = openSync(this.file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
          try {if (fstatSync(descriptor).uid !== process.getuid?.()) throw Error('Invalid lease'); const now = new Date(); futimesSync(descriptor, now, now)}
          finally {closeSync(descriptor)}
        } else this.cancel()
      } catch {this.cancel()}}, 5000)
      this.heartbeat.unref()
      for (let attempt = 0; attempt < 40; attempt++) {
        if (generation !== this.generation || this.token !== token) throw Error('lid-unavailable')
        const status = await this.service.status()
        if (this.matches(status)) {
          if (status.mode === 'safety-stop' || status.mode === 'system-changed') throw Error(status.mode)
          if (status.mode === 'error') throw Error('restore-failed')
          if (status.mode === 'active' || status.mode === 'external') {
            if (parseSleepDisabled(await this.run('/usr/bin/pmset', ['-g']))) return status.mode
          }
        }
        await delay(200)
      }
      throw Error('lid-unavailable')
    } catch (error) {
      this.cancel()
      try {await this.stop()} catch {throw Error('restore-failed')}
      if (error instanceof Error && error.message === 'restore-failed') throw Error('lid-unavailable')
      throw error
    }
    finally {rmSync(temporary, {force: true})}
  }
  async active(): Promise<boolean> {
    if (!this.token || !this.ownsLease()) return false
    const status = await this.service.status()
    // Global errors omit the lease token. Preserve the request for recovery
    // instead of treating that temporary outcome as another owner's state.
    if (status.mode === 'error') throw Error('restore-failed')
    if (!this.matches(status)) return false
    if (status.mode === 'safety-stop' || status.mode === 'system-changed') throw Error(status.mode)
    return (status.mode === 'active' || status.mode === 'external') && parseSleepDisabled(await this.run('/usr/bin/pmset', ['-g']))
  }
  cancel(): void {
    this.generation++
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.heartbeat = undefined
    if (this.token && this.lease) this.retiring = this.lease
    try {this.publishRelease()} catch {try {if (this.ownsLease()) rmSync(this.file, {force: true})} catch {}}
    this.token = undefined
  }
  private publishRelease(): void {
    const retiring = this.retiring
    if (!retiring) return
    // A newer client owns its lease. Only replace our token or a missing file.
    try {lstatSync(this.file); if (!this.ownsLease(retiring.token)) return} catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const temporary = join(this.service.directory, `session.${retiring.token}.release.tmp`)
    try {
      writeFileSync(temporary, JSON.stringify({...retiring, release: true}) + '\n', {mode: 0o600, flush: true, flag: 'wx'})
      renameSync(temporary, this.file)
    } finally {rmSync(temporary, {force: true})}
  }
  async stop(): Promise<void> {
    this.cancel()
    const retiring = this.retiring
    if (!retiring) return
    for (let attempt = 0; attempt < 50; attempt++) {
      let status: PowerServiceStatus | undefined
      try {status = await this.service.status()} catch {}
      // Recovery failures are global and intentionally may carry no lease token.
      if (status?.mode === 'error') throw Error('restore-failed')
      if (status) {
        const transferred = status.token !== retiring.token && (status.mode === 'active' || status.mode === 'external')
        if (transferred) {this.retiring = undefined; return}
        // An earlier idle snapshot cannot acknowledge a cancelled acquisition.
        if (status.mode === 'idle' && status.token === retiring.token && status.ownerPid === process.pid) {
          if (this.ownsLease(retiring.token)) rmSync(this.file, {force: true})
          this.retiring = undefined; return
        }
      }
      await delay(200)
    }
    throw Error('restore-failed')
  }
  private matches(status: PowerServiceStatus): boolean {return status.ownerPid === process.pid && status.token === this.token}
  private ownsLease(token = this.token): boolean {
    if (!token) return false
    let descriptor: number | undefined
    try {
      descriptor = openSync(this.file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
      const stat = fstatSync(descriptor)
      if (!stat.isFile() || stat.uid !== process.getuid?.() || stat.size > 2048) return false
      const value = JSON.parse(readFileSync(descriptor, 'utf8'))
      return value.token === token && value.pid === process.pid
    } catch {return false}
    finally {if (descriptor !== undefined) closeSync(descriptor)}
  }
}
