import {mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {isPowerSettingKey, type LidMode, type PowerSettingsState} from '../../shared/power-settings'

export interface LidGuard {
  start(allowAuthorization?: boolean): Promise<Exclude<LidMode, 'off'>>
  stop(): Promise<void>
  active(): Promise<boolean>
  /** Synchronous lease release also covers quit during the administrator dialog. */
  cancel(): void
}

export type PowerDiagnostic = {event: string; code?: string; mode?: string; ownerPid?: number; servicePid?: number; leaseInode?: number; leaseModifiedMs?: number; leaseOwned?: boolean; statusMatches?: boolean}

export class PowerPreferenceStore {
  private readonly file: string
  constructor(private readonly root: string) {this.file = join(root, 'power-settings.json')}
  private read(): {preventAutoSleep: boolean; keepAwakeWhenLidClosed: boolean} {
    const defaults = {preventAutoSleep: false, keepAwakeWhenLidClosed: false}
    try {
      if (statSync(this.file).size > 1024) return defaults
      const value = JSON.parse(readFileSync(this.file, 'utf8'))
      if (value?.version !== 1 && value?.version !== 2) return defaults
      return {preventAutoSleep: value.preventAutoSleep === true, keepAwakeWhenLidClosed: value.version === 2 && value.keepAwakeWhenLidClosed === true}
    } catch {return defaults}
  }
  get(): boolean {return this.read().preventAutoSleep}
  getLid(): boolean {return this.read().keepAwakeWhenLidClosed}
  recordDiagnostic(value: PowerDiagnostic): void {
    const file = join(this.root, 'power-diagnostics.json'), temporary = `${file}.${process.pid}.tmp`
    try {
      mkdirSync(this.root, {recursive: true, mode: 0o700})
      let history: unknown[] = []
      try {if (statSync(file).size < 65536) {const previous = JSON.parse(readFileSync(file, 'utf8')); if (Array.isArray(previous)) history = previous.slice(-31)}} catch {}
      const record: Record<string, string|number|boolean> = {at: new Date().toISOString(), uptimeMs: Math.round(process.uptime()*1000)}
      for (const key of ['event','code','mode','ownerPid','servicePid','leaseInode','leaseModifiedMs','leaseOwned','statusMatches'] as const) {
        const field = value[key]
        if (typeof field === 'string') record[key] = field.slice(0, 80)
        else if (typeof field === 'boolean' || typeof field === 'number' && Number.isFinite(field)) record[key] = field
      }
      history.push(record)
      writeFileSync(temporary, JSON.stringify(history) + '\n', {mode: 0o600})
      renameSync(temporary, file)
    } catch {} finally {try {rmSync(temporary, {force: true})} catch {}}
  }
  set(preventAutoSleep: boolean): void {this.write({...this.read(), preventAutoSleep})}
  setLid(keepAwakeWhenLidClosed: boolean): void {this.write({...this.read(), keepAwakeWhenLidClosed})}
  private write(preferences: {preventAutoSleep: boolean; keepAwakeWhenLidClosed: boolean}): void {
    const temporary = `${this.file}.${process.pid}.tmp`
    try {
      mkdirSync(this.root, {recursive: true, mode: 0o700})
      writeFileSync(temporary, JSON.stringify({version: 2, ...preferences}) + '\n', {mode: 0o600, flush: true})
      renameSync(temporary, this.file)
    } finally {rmSync(temporary, {force: true})}
  }
}

type Blocker = {start(type: 'prevent-app-suspension'): number; stop(id: number): boolean; isStarted(id: number): boolean}
type Options = {store: PowerPreferenceStore; blocker: Blocker; guard: LidGuard; canPreventSleep?: () => boolean}

/** One owner per Electron main process; renderer reloads never own power leases. */
export class PowerSettingsController {
  private state: PowerSettingsState = {preventAutoSleep: false, keepAwakeWhenLidClosed: false, lidMode: 'off', busy: false, error: null}
  private blockerId: number | undefined
  private disposed = false
  private initialized = false
  private queue: Promise<unknown> = Promise.resolve()
  constructor(private readonly options: Options) {
    if (options.store.get() && options.canPreventSleep?.() !== false) {
      try {this.blockerId = this.acquire(); this.state.preventAutoSleep = true}
      catch {this.state.error = 'power-unavailable'}
    }
  }
  get(): PowerSettingsState {return {...this.state}}

  /** Restore saved intent only through an already-installed service, without UI. */
  initialize(): Promise<PowerSettingsState> {
    return this.serial(async () => {
      if (this.initialized || this.disposed) return this.get()
      this.initialized = true
      if (!this.options.store.getLid()) return this.get()
      this.state.busy = true
      try {
        if (this.options.canPreventSleep?.() === false) this.state.error = 'safety-stop'
        else await this.setLid(true, false, false)
      } finally {this.state.busy = false}
      return this.get()
    })
  }

  set(key: unknown, value: unknown): Promise<PowerSettingsState> {
    if (!isPowerSettingKey(key) || typeof value !== 'boolean') return Promise.reject(Error('Invalid power setting'))
    return this.serial(async () => {
      if (this.disposed) return this.get()
      this.state.busy = true; this.state.error = null
      try {
        if (value && this.options.canPreventSleep?.() === false) this.state.error = 'safety-stop'
        else if (key === 'preventAutoSleep') this.setIdle(value)
        else await this.setLid(value, true, true)
      } finally {this.state.busy = false}
      return this.get()
    })
  }

  refresh(): Promise<PowerSettingsState> {
    return this.serial(async () => {
      if (this.disposed) return this.get()
      if (this.blockerId !== undefined && !this.options.blocker.isStarted(this.blockerId)) {
        this.blockerId = undefined; this.state.preventAutoSleep = false; this.state.error = 'power-unavailable'
      }
      if (this.state.keepAwakeWhenLidClosed) {
        try {
          if (!await this.options.guard.active()) {
            await this.options.guard.stop()
            this.state.keepAwakeWhenLidClosed = false; this.state.lidMode = 'off'; this.state.error = 'system-changed'
          } else if (this.state.error === 'restore-failed') this.state.error = null
        } catch (error) {
          if (error instanceof Error && (error.message === 'safety-stop' || error.message === 'system-changed')) {
            try {await this.options.guard.stop(); this.state.keepAwakeWhenLidClosed = false; this.state.lidMode = 'off'; this.state.error = error.message}
            catch {this.state.error = 'restore-failed'}
          } else this.state.error = 'restore-failed'
        }
      }
      return this.get()
    })
  }

  async safetyStop(): Promise<void> {
    // Drop the root lease immediately; do not wait behind an authorization dialog.
    this.options.guard.cancel()
    await this.serial(async () => {
      if (this.disposed) return
      await this.setLid(false, false, false)
      if (this.blockerId !== undefined) this.options.blocker.stop(this.blockerId)
      this.blockerId = undefined; this.state.preventAutoSleep = false
      if (this.state.error !== 'restore-failed') this.state.error = 'safety-stop'
    })
  }

  dispose(): void {
    this.options.store.recordDiagnostic({event: 'app-dispose', mode: this.state.lidMode})
    this.disposed = true
    this.options.guard.cancel()
    if (this.blockerId !== undefined) this.options.blocker.stop(this.blockerId)
    this.blockerId = undefined
    this.state.preventAutoSleep = false; this.state.keepAwakeWhenLidClosed = false; this.state.lidMode = 'off'
  }
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.queue.then(operation)
    this.queue = pending.catch(() => {})
    return pending
  }
  private acquire(): number {
    const id = this.options.blocker.start('prevent-app-suspension')
    if (!this.options.blocker.isStarted(id)) {this.options.blocker.stop(id); throw Error('power-unavailable')}
    return id
  }
  private async setLid(value: boolean, allowAuthorization: boolean, persist: boolean): Promise<void> {
    if (value === this.state.keepAwakeWhenLidClosed && (!persist || this.options.store.getLid() === value)) return
    try {
      if (value) {
        const mode = await this.options.guard.start(allowAuthorization)
        if (this.disposed) {await this.options.guard.stop(); return}
        if (persist) {
          try {this.options.store.setLid(true)}
          catch {await this.options.guard.stop(); this.state.error = 'save-failed'; return}
        }
        this.state.lidMode = mode; this.state.keepAwakeWhenLidClosed = true
      } else {
        try {await this.options.guard.stop()}
        catch {this.state.error = 'restore-failed'; return}
        this.state.keepAwakeWhenLidClosed = false; this.state.lidMode = 'off'
        if (persist) {
          try {this.options.store.setLid(false)}
          catch {this.state.error = 'save-failed'}
        }
      }
    } catch (error) {
      this.options.guard.cancel()
      const code = error instanceof Error ? error.message : ''
      this.state.error = code === 'authorization-cancelled' || code === 'helper-unavailable' || code === 'safety-stop' || code === 'restore-failed' ? code : 'lid-unavailable'
      if (code === 'restore-failed') {this.state.keepAwakeWhenLidClosed = true; this.state.lidMode = 'active'}
    }
  }
  private setIdle(value: boolean): void {
    if (value === this.state.preventAutoSleep) {
      if (this.options.store.get() !== value) {try {this.options.store.set(value)} catch {this.state.error = 'save-failed'}}
      return
    }
    const previousId = this.blockerId
    let newId: number | undefined
    try {
      if (value) newId = this.acquire()
    } catch {this.state.error = 'power-unavailable'; return}
    try {this.options.store.set(value)}
    catch {
      if (newId !== undefined) this.options.blocker.stop(newId)
      this.state.error = 'save-failed'; return
    }
    if (!value && previousId !== undefined) this.options.blocker.stop(previousId)
    this.blockerId = newId; this.state.preventAutoSleep = value
  }
}
