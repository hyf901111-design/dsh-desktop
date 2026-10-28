import {randomBytes} from 'node:crypto'
import {lstatSync, openSync, fstatSync, futimesSync, closeSync, constants, readFileSync, linkSync, renameSync, rmSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {setTimeout as delay} from 'node:timers/promises'
import type {LidGuard, PowerDiagnostic} from './controller'
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
  private readonly onDiagnostic: (value: PowerDiagnostic) => void
  private token: string | undefined
  private lease: Lease | undefined
  private retiring: Lease | undefined
  private heartbeat: ReturnType<typeof setInterval> | undefined
  private generation = 0
  constructor(options: {service?: PowerService; run?: PowerCommand; helperSource?: string; onDiagnostic?: (value: PowerDiagnostic) => void} = {}) {
    this.service = options.service ?? new MacOSPowerService({helperSource: options.helperSource, run: options.run})
    this.run = options.run ?? runPowerCommand
    this.file = join(this.service.directory, 'session.json')
    this.onDiagnostic = options.onDiagnostic ?? (() => {})
  }
  async start(allowAuthorization = true, preserveExistingLease = false): Promise<'active'|'external'> {
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
    const token = randomBytes(16).toString('hex')
    const lease: Lease = {version: 1, pid: process.pid, started, token}
    const temporary = join(this.service.directory, `session.${token}.tmp`)
    let published = false
    try {
      writeFileSync(temporary, JSON.stringify(lease) + '\n', {mode: 0o600, flush: true, flag: 'wx'})
      if (preserveExistingLease) {
        // Publishing the complete file is atomic and cannot replace a lease
        // acquired after our old nonce was retired, even between awaits.
        try {linkSync(temporary, this.file)}
        catch (error) {if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw Error('lease-transferred'); throw error}
      } else renameSync(temporary, this.file)
      published = true; this.token = token; this.lease = lease
      if (preserveExistingLease) rmSync(temporary, {force: true})
      this.heartbeat = setInterval(() => {try {
        if (this.ownsLease()) {
          const descriptor = openSync(this.file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
          try {if (fstatSync(descriptor).uid !== process.getuid?.()) throw Error('Invalid lease'); const now = new Date(); futimesSync(descriptor, now, now)}
          finally {closeSync(descriptor)}
        } else {this.report('lease-lost'); this.cancel()}
      } catch (error) {this.report('heartbeat-failed', undefined, (error as NodeJS.ErrnoException).code ?? 'unknown'); this.cancel()}}, 5000)
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
      // A conflicting publication never owned a nonce, so has no release ACK
      // to await and must leave the existing client's file untouched.
      if (!published) throw error
      this.cancel()
      try {await this.stop()} catch {throw Error('restore-failed')}
      if (error instanceof Error && error.message === 'restore-failed') throw Error('lid-unavailable')
      throw error
    }
    finally {rmSync(temporary, {force: true})}
  }
  async active(): Promise<boolean> {
    if (!this.token || !this.ownsLease()) {this.report('lease-lost'); return false}
    const status = await this.service.status()
    // Global errors omit the lease token. Preserve the request for recovery
    // instead of treating that temporary outcome as another owner's state.
    if (status.mode === 'error') {this.report('service-error', status); throw Error('restore-failed')}
    if (!this.matches(status)) {this.report('status-mismatch', status); return false}
    if (status.mode === 'safety-stop' || status.mode === 'system-changed') {this.report(status.mode, status); throw Error(status.mode)}
    if (status.mode !== 'active' && status.mode !== 'external') {this.report('status-mismatch', status); return false}
    // Native publishes the status only after its power write/readback. A zero
    // paired with the previous active snapshot is unconfirmed until the next
    // explicit native drift/safety/error result, and must not revoke the lease.
    if (!parseSleepDisabled(await this.run('/usr/bin/pmset', ['-g']))) {this.report('sleep-unconfirmed', status); throw Error('restore-failed')}
    return true
  }
  private report(event: string, status?: PowerServiceStatus, code?: string): void {
    try {
      let stat: {ino: number; mtimeMs: number} | undefined
      try {stat = lstatSync(this.file)} catch {}
      this.onDiagnostic({event, code, mode: status?.mode, ownerPid: status?.ownerPid, servicePid: status?.servicePid, leaseInode: stat?.ino, leaseModifiedMs: stat?.mtimeMs, leaseOwned: this.ownsLease(), statusMatches: status ? this.matches(status) : undefined})
    } catch {}
  }
  cancel(): void {
    if (this.token) this.report('cancel-request')
    this.generation++
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.heartbeat = undefined
    if (this.token && this.lease) this.retiring = this.lease
    try {this.publishRelease()} catch (error) {this.report('release-publish-failed', undefined, (error as NodeJS.ErrnoException).code ?? 'unknown'); try {if (this.ownsLease()) rmSync(this.file, {force: true})} catch {}}
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
