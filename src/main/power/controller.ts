import {mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {isPowerSettingKey, type LidMode, type PowerSettingsState} from '../../shared/power-settings'

export interface LidGuard {
  start(): Promise<Exclude<LidMode, 'off'>>
  stop(): Promise<void>
  active(): Promise<boolean>
  /** Synchronous lease release also covers quit during the administrator dialog. */
  cancel(): void
}

export class PowerPreferenceStore {
  private readonly file: string
  constructor(private readonly root: string) {this.file = join(root, 'power-settings.json')}
  get(): boolean {
    try {
      if (statSync(this.file).size > 1024) return false
      const value = JSON.parse(readFileSync(this.file, 'utf8'))
      return value?.version === 1 && value.preventAutoSleep === true
    } catch {return false}
  }
  set(preventAutoSleep: boolean): void {
    const temporary = `${this.file}.${process.pid}.tmp`
    try {
      mkdirSync(this.root, {recursive: true, mode: 0o700})
      writeFileSync(temporary, JSON.stringify({version: 1, preventAutoSleep}) + '\n', {mode: 0o600, flush: true})
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
  private queue: Promise<unknown> = Promise.resolve()
  constructor(private readonly options: Options) {
    if (options.store.get()) {
      try {this.blockerId = this.acquire(); this.state.preventAutoSleep = true}
      catch {this.state.error = 'power-unavailable'}
    }
  }
  get(): PowerSettingsState {return {...this.state}}

  set(key: unknown, value: unknown): Promise<PowerSettingsState> {
    if (!isPowerSettingKey(key) || typeof value !== 'boolean') return Promise.reject(Error('Invalid power setting'))
    return this.serial(async () => {
      if (this.disposed) return this.get()
      this.state.busy = true; this.state.error = null
      try {
        if (value && this.options.canPreventSleep?.() === false) this.state.error = 'safety-stop'
        else if (key === 'preventAutoSleep') this.setIdle(value)
        else if (value !== this.state.keepAwakeWhenLidClosed) {
          if (value) {
            try {
              const mode = await this.options.guard.start()
              if (this.disposed) await this.options.guard.stop()
              else {this.state.lidMode = mode; this.state.keepAwakeWhenLidClosed = true}
            } catch (error) {
              this.options.guard.cancel()
              const code = error instanceof Error ? error.message : ''
              this.state.error = code === 'authorization-cancelled' || code === 'safety-stop' || code === 'restore-failed' ? code : 'lid-unavailable'
              if (code === 'restore-failed') {this.state.keepAwakeWhenLidClosed = true; this.state.lidMode = 'active'}
            }
          } else {
            try {await this.options.guard.stop(); this.state.keepAwakeWhenLidClosed = false; this.state.lidMode = 'off'}
            catch {this.state.error = 'restore-failed'}
          }
        }
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
          }
        } catch {this.state.error = 'restore-failed'}
      }
      return this.get()
    })
  }

  async safetyStop(): Promise<void> {
    // Drop the root lease immediately; do not wait behind an authorization dialog.
    this.options.guard.cancel()
    await this.set('keepAwakeWhenLidClosed', false)
    await this.set('preventAutoSleep', false)
    this.state.error = 'safety-stop'
  }

  dispose(): void {
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
  private setIdle(value: boolean): void {
    if (value === this.state.preventAutoSleep) return
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
