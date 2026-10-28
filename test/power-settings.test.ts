import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {PowerPreferenceStore, PowerSettingsController} from '../src/main/power/controller'

const roots: string[] = []
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'ew-power-test-')); roots.push(root)
  const ids = new Set<number>(); let sequence = 0, lid = false, starts = 0
  const authorizations: boolean[] = []
  const blocker = {start(type: string) {expect(type).toBe('prevent-app-suspension'); const id = sequence++; ids.add(id); return id}, stop(id: number) {ids.delete(id); return true}, isStarted(id: number) {return ids.has(id)}}
  const guard = {async start(allowAuthorization = true): Promise<'active'|'external'> {starts++; authorizations.push(allowAuthorization); lid = true; return 'active'}, async stop() {lid = false}, async active() {return lid}, cancel() {lid = false}}
  const store = new PowerPreferenceStore(root)
  const controller = new PowerSettingsController({store, blocker, guard})
  return {root, ids, guard, store, controller, authorizations, starts: () => starts, drift: () => {lid = false}}
}
afterEach(() => {vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true})})

describe('power preference lifecycle', () => {
  it('keeps bounded power diagnostics without storing request tokens or transcript content', () => {
    const f = fixture()
    for (let index = 0; index < 40; index++) f.store.recordDiagnostic({event: 'sleep-unconfirmed', servicePid: index, token: 'private-token', text: 'private-text'} as any)
    const source = readFileSync(join(f.root, 'power-diagnostics.json'), 'utf8'), rows = JSON.parse(source)
    expect(rows).toHaveLength(32)
    expect(rows.at(-1)).toMatchObject({event: 'sleep-unconfirmed', servicePid: 39})
    expect(source).not.toContain('private-')
    expect(f.store.getLid()).toBe(false)
  })
  it('defaults off, persists idle prevention across launch, and releases its own assertion on exit', async () => {
    const f = fixture()
    expect(f.controller.get().preventAutoSleep).toBe(false)
    await f.controller.set('preventAutoSleep', true)
    expect(f.ids.size).toBe(1)
    await f.controller.set('preventAutoSleep', true)
    expect(f.ids.size).toBe(1)
    f.controller.dispose()
    expect(f.ids.size).toBe(0)
    const next = new PowerSettingsController({store: f.store, blocker: {start: () => 15, stop: () => true, isStarted: () => true}, guard: f.guard})
    expect(next.get().preventAutoSleep).toBe(true)
    expect(next.get().keepAwakeWhenLidClosed).toBe(false)
    expect(f.starts()).toBe(0)
    next.dispose()
  })
  it('keeps both saved switches independent while stopping the closed-lid lease', async () => {
    const f = fixture()
    await f.controller.set('preventAutoSleep', true)
    await f.controller.set('keepAwakeWhenLidClosed', true)
    await f.controller.set('keepAwakeWhenLidClosed', false)
    expect(f.controller.get()).toMatchObject({preventAutoSleep: true, keepAwakeWhenLidClosed: false})
    expect(f.ids.size).toBe(1)
    expect(JSON.parse(readFileSync(join(f.root, 'power-settings.json'), 'utf8'))).toEqual({version: 2, preventAutoSleep: true, keepAwakeWhenLidClosed: false})
    f.controller.dispose()
  })
  it('cancelling administrator authorization leaves the setting off with a useful error', async () => {
    const f = fixture()
    f.guard.start = async () => {throw Error('authorization-cancelled')}
    expect(await f.controller.set('keepAwakeWhenLidClosed', true)).toMatchObject({keepAwakeWhenLidClosed: false, busy: false, error: 'authorization-cancelled'})
  })
  it('rolls back the blocker if saving preferences fails', async () => {
    const f = fixture()
    f.store.set = () => {throw Error('disk full')}
    expect(await f.controller.set('preventAutoSleep', true)).toMatchObject({preventAutoSleep: false, error: 'save-failed'})
    expect(f.ids.size).toBe(0)
  })
  it('serializes overlapping changes and prevents a late authorization from surviving exit', async () => {
    const f = fixture(); let release!: () => void
    f.guard.start = () => new Promise(resolve => {release = () => resolve('active')})
    const first = f.controller.set('keepAwakeWhenLidClosed', true)
    await Promise.resolve()
    const second = f.controller.set('keepAwakeWhenLidClosed', false)
    expect(f.controller.get().busy).toBe(true)
    f.controller.dispose(); release()
    await Promise.all([first, second])
    expect(f.controller.get()).toMatchObject({keepAwakeWhenLidClosed: false, busy: false})
    expect(await f.guard.active()).toBe(false)
  })
  it('reacquires the lease when a queued off is superseded by a newer on', async () => {
    const f = fixture(); await f.controller.set('keepAwakeWhenLidClosed', true)
    const off = f.controller.set('keepAwakeWhenLidClosed', false)
    const on = f.controller.set('keepAwakeWhenLidClosed', true)
    await Promise.all([off, on])
    expect(await f.guard.active()).toBe(true)
    expect(f.controller.get()).toMatchObject({keepAwakeWhenLidClosed: true, error: null})
    expect(f.store.getLid()).toBe(true)
    f.controller.dispose()
  })
  it('reacquires a newer explicit on after superseding recovery while the old lease retires', async () => {
    const f = fixture(); await f.controller.set('keepAwakeWhenLidClosed', true)
    const active = f.guard.active, stop = f.guard.stop
    f.guard.active = async () => {throw Error('system-changed')}
    let release!: () => void, entered = false
    f.guard.stop = async () => {entered = true; await new Promise<void>(resolve => {release = resolve}); await stop()}
    const refresh = f.controller.refresh()
    await vi.waitFor(() => expect(entered).toBe(true))
    const on = f.controller.set('keepAwakeWhenLidClosed', true)
    release(); await Promise.all([refresh, on])
    expect(await active()).toBe(true)
    expect(f.controller.get()).toMatchObject({keepAwakeWhenLidClosed: true, error: null})
    expect(f.authorizations).toEqual([true, true])
    f.controller.dispose()
  })
  it('reports system drift, releases the lease, and leaves ordinary sleep prevention in place', async () => {
    const f = fixture()
    await f.controller.set('preventAutoSleep', true)
    await f.controller.set('keepAwakeWhenLidClosed', true)
    f.drift()
    expect(await f.controller.refresh()).toMatchObject({keepAwakeWhenLidClosed: false, preventAutoSleep: true, error: 'system-changed'})
    f.controller.dispose()
  })
  it('keeps the lease through a temporary service failure and clears its warning after confirmed recovery', async () => {
    const f = fixture(); let stops = 0
    await f.controller.set('keepAwakeWhenLidClosed', true)
    f.guard.stop = async () => {stops++}
    f.guard.active = async () => {throw Error('restore-failed')}
    expect(await f.controller.refresh()).toMatchObject({keepAwakeWhenLidClosed: true, error: 'restore-failed'})
    expect(stops).toBe(0)
    expect(f.store.getLid()).toBe(true)
    f.guard.active = async () => true
    expect(await f.controller.refresh()).toMatchObject({keepAwakeWhenLidClosed: true, error: null})
    f.controller.dispose()
  })
  it('does not claim a failed restoration succeeded and lets the user retry', async () => {
    const f = fixture()
    await f.controller.set('keepAwakeWhenLidClosed', true)
    f.guard.stop = async () => {throw Error('restore-failed')}
    expect(await f.controller.set('keepAwakeWhenLidClosed', false)).toMatchObject({keepAwakeWhenLidClosed: true, error: 'restore-failed'})
    f.guard.stop = async () => {}
    expect(await f.controller.set('keepAwakeWhenLidClosed', false)).toMatchObject({keepAwakeWhenLidClosed: false, error: null})
  })
  it('rejects unknown switches and non-boolean values before applying any change', async () => {
    const f = fixture()
    await expect(f.controller.set('command', true)).rejects.toThrow()
    await expect(f.controller.set('keepAwakeWhenLidClosed', 'true')).rejects.toThrow()
    expect(f.starts()).toBe(0)
    expect(f.ids.size).toBe(0)
  })
  it('ignores corrupt and oversized preferences rather than authorizing a helper on launch', () => {
    const f = fixture()
    writeFileSync(join(f.root, 'power-settings.json'), '{')
    expect(f.store.get()).toBe(false)
    writeFileSync(join(f.root, 'power-settings.json'), JSON.stringify({version: 1, preventAutoSleep: 'true'}))
    expect(f.store.get()).toBe(false)
    writeFileSync(join(f.root, 'power-settings.json'), ' '.repeat(3000))
    expect(f.store.get()).toBe(false)
  })
  it('does not acquire either sleep prevention when thermal protection disallows it', async () => {
    const f = fixture()
    const controller = new PowerSettingsController({store: f.store, blocker: {start: () => {throw Error('must not start')}, stop: () => true, isStarted: () => false}, guard: f.guard, canPreventSleep: () => false})
    expect(await controller.set('keepAwakeWhenLidClosed', true)).toMatchObject({keepAwakeWhenLidClosed: false, busy: false, error: 'safety-stop'})
    expect(await controller.set('preventAutoSleep', true)).toMatchObject({preventAutoSleep: false, busy: false, error: 'safety-stop'})
    expect(f.starts()).toBe(0)
  })
  it('remembers the closed-lid preference across quit and restores it without asking to install again', async () => {
    const f = fixture()
    await f.controller.set('keepAwakeWhenLidClosed', true)
    expect(f.store.getLid()).toBe(true)
    f.controller.dispose()
    expect(await f.guard.active()).toBe(false)
    const next = new PowerSettingsController({store: f.store, blocker: {start: () => 2, stop: () => true, isStarted: () => true}, guard: f.guard})
    expect(await next.initialize()).toMatchObject({keepAwakeWhenLidClosed: true, lidMode: 'active', busy: false})
    expect(f.authorizations).toEqual([true, false])
    await next.set('preventAutoSleep', true)
    expect(f.store.getLid()).toBe(true)
    await next.set('keepAwakeWhenLidClosed', false)
    expect(f.store.getLid()).toBe(false)
    expect(f.store.get()).toBe(true)
    next.dispose()
  })
  it('never opens an authorization dialog automatically when the saved helper needs repair', async () => {
    const f = fixture()
    f.store.setLid(true)
    f.guard.start = async allow => {f.authorizations.push(allow ?? true); throw Error('helper-unavailable')}
    expect(await f.controller.initialize()).toMatchObject({keepAwakeWhenLidClosed: false, error: 'helper-unavailable', busy: false})
    expect(f.authorizations).toEqual([false])
    expect(f.store.getLid()).toBe(true)
    await f.controller.set('keepAwakeWhenLidClosed', false)
    expect(f.store.getLid()).toBe(false)
    f.controller.dispose()
  })
  it('releases an acquired closed-lid lease when saving its preference fails', async () => {
    const f = fixture()
    f.store.setLid = () => {throw Error('disk full')}
    expect(await f.controller.set('keepAwakeWhenLidClosed', true)).toMatchObject({keepAwakeWhenLidClosed: false, error: 'save-failed', busy: false})
    expect(await f.guard.active()).toBe(false)
    expect(f.store.getLid()).toBe(false)
    f.controller.dispose()
  })
  it('migrates old idle-only preferences without silently enrolling closed-lid operation', async () => {
    const f = fixture()
    writeFileSync(join(f.root, 'power-settings.json'), JSON.stringify({version: 1, preventAutoSleep: true}))
    expect(f.store.get()).toBe(true)
    expect(f.store.getLid()).toBe(false)
    await f.controller.initialize()
    expect(f.starts()).toBe(0)
  })
  it('temporarily releases both protections on a thermal stop without forgetting saved intent', async () => {
    const f = fixture()
    await f.controller.set('preventAutoSleep', true)
    await f.controller.set('keepAwakeWhenLidClosed', true)
    await f.controller.safetyStop()
    expect(f.controller.get()).toMatchObject({preventAutoSleep: false, keepAwakeWhenLidClosed: false, error: 'safety-stop'})
    expect(f.store.get()).toBe(true)
    expect(f.store.getLid()).toBe(true)
    expect(f.ids.size).toBe(0)
    expect(await f.guard.active()).toBe(false)
    f.controller.dispose()
  })

  it('automatically reacquires a confirmed owned drift once without authorization or changing saved intent', async () => {
    const f = fixture()
    await f.controller.set('keepAwakeWhenLidClosed', true)
    f.guard.active = async () => {throw Error('system-changed')}
    expect(await f.controller.refresh()).toMatchObject({keepAwakeWhenLidClosed: true, lidMode: 'active', error: null, busy: false})
    expect(f.authorizations).toEqual([true, false])
    expect(f.store.getLid()).toBe(true)
    const rows = JSON.parse(readFileSync(join(f.root, 'power-diagnostics.json'), 'utf8'))
    expect(rows.map((row: any) => row.event)).toEqual(['drift-recovery-start', 'drift-recovery-succeeded'])
    f.controller.dispose()
  })

  it.each(['restore-failed', 'safety-stop'])('does not automatically reacquire an unconfirmed or unsafe result: %s', async code => {
    const f = fixture(); await f.controller.set('keepAwakeWhenLidClosed', true)
    f.guard.active = async () => {throw Error(code)}
    await f.controller.refresh()
    expect(f.authorizations).toEqual([true])
    expect(f.store.getLid()).toBe(true)
    f.controller.dispose()
  })

  it('does not acquire ownership when an externally borrowed sleep policy drifts', async () => {
    const f = fixture(); f.guard.start = async () => 'external'
    await f.controller.set('keepAwakeWhenLidClosed', true)
    let starts = 0; f.guard.start = async () => {starts++; return 'active'}
    f.guard.active = async () => {throw Error('system-changed')}
    expect(await f.controller.refresh()).toMatchObject({keepAwakeWhenLidClosed: false, error: 'system-changed'})
    expect(starts).toBe(0)
    f.controller.dispose()
  })

  it.each(['user-off', 'safety-stop', 'dispose'] as const)('revokes a recovery while its old lease is stopping: %s', async action => {
    const f = fixture(); await f.controller.set('keepAwakeWhenLidClosed', true)
    f.guard.active = async () => {throw Error('system-changed')}
    let release!: () => void, entered = false
    f.guard.stop = async () => {entered = true; await new Promise<void>(resolve => {release = resolve})}
    const refresh = f.controller.refresh()
    await vi.waitFor(() => expect(entered).toBe(true))
    let ending: Promise<unknown> = Promise.resolve()
    if (action === 'user-off') ending = f.controller.set('keepAwakeWhenLidClosed', false)
    else if (action === 'safety-stop') ending = f.controller.safetyStop()
    else f.controller.dispose()
    f.guard.stop = async () => {}; release()
    await Promise.all([refresh, ending])
    expect(f.controller.get().keepAwakeWhenLidClosed).toBe(false)
    expect(f.authorizations).toEqual([true])
    expect(f.store.getLid()).toBe(action !== 'user-off')
    f.controller.dispose()
  })

  it.each(['user-off', 'safety-stop', 'dispose'] as const)('releases a late reacquisition after cancellation: %s', async action => {
    const f = fixture(); await f.controller.set('keepAwakeWhenLidClosed', true)
    f.guard.active = async () => {throw Error('system-changed')}
    let finish!: () => void, entered = false, active = false
    f.guard.start = async allow => {expect(allow).toBe(false); entered = true; await new Promise<void>(resolve => {finish = resolve}); active = true; return 'active'}
    f.guard.stop = async () => {active = false}
    f.guard.cancel = () => {active = false}
    const refresh = f.controller.refresh()
    await vi.waitFor(() => expect(entered).toBe(true))
    let ending: Promise<unknown> = Promise.resolve()
    if (action === 'user-off') ending = f.controller.set('keepAwakeWhenLidClosed', false)
    else if (action === 'safety-stop') ending = f.controller.safetyStop()
    else f.controller.dispose()
    finish(); await Promise.all([refresh, ending])
    expect(active).toBe(false)
    expect(f.controller.get().keepAwakeWhenLidClosed).toBe(false)
    expect(f.store.getLid()).toBe(action !== 'user-off')
    f.controller.dispose()
  })

  it('rechecks thermal permission after stopping the old lease before reacquiring', async () => {
    const f = fixture(); let safe = true
    const controller = new PowerSettingsController({store: f.store, guard: f.guard, blocker: {start: () => 2, stop: () => true, isStarted: () => true}, canPreventSleep: () => safe})
    await controller.set('keepAwakeWhenLidClosed', true)
    f.guard.active = async () => {throw Error('system-changed')}
    f.guard.stop = async () => {safe = false}
    expect(await controller.refresh()).toMatchObject({keepAwakeWhenLidClosed: false, error: 'safety-stop'})
    expect(f.authorizations).toEqual([true])
    expect(f.store.getLid()).toBe(true)
    controller.dispose()
  })

  it('stops a failed reacquisition without retrying or authorizing on later refreshes', async () => {
    const f = fixture(); await f.controller.set('keepAwakeWhenLidClosed', true)
    f.guard.active = async () => {throw Error('system-changed')}
    let repairs = 0
    f.guard.start = async allow => {expect(allow).toBe(false); repairs++; throw Error('helper-unavailable')}
    expect(await f.controller.refresh()).toMatchObject({keepAwakeWhenLidClosed: false, error: 'helper-unavailable'})
    await f.controller.refresh(); await f.controller.refresh()
    expect(repairs).toBe(1)
    expect(f.store.getLid()).toBe(true)
    f.controller.dispose()
  })

  it('requires a vacant lease for automatic recovery and stops when another client has claimed it', async () => {
    const f = fixture(); await f.controller.set('keepAwakeWhenLidClosed', true)
    f.guard.active = async () => {throw Error('system-changed')}
    let repairs = 0
    f.guard.start = async (allow, preserveExistingLease?: boolean) => {
      expect(allow).toBe(false); expect(preserveExistingLease).toBe(true)
      repairs++; throw Error('lease-transferred')
    }
    expect(await f.controller.refresh()).toMatchObject({keepAwakeWhenLidClosed: false, error: 'system-changed'})
    await f.controller.refresh()
    expect(repairs).toBe(1)
    expect(f.store.getLid()).toBe(true)
    const rows = JSON.parse(readFileSync(join(f.root, 'power-diagnostics.json'), 'utf8'))
    expect(rows.at(-1)).toMatchObject({event: 'drift-recovery-blocked', code: 'lease-transferred'})
    f.controller.dispose()
  })

  it.each(['cooldown', 'rate-limit'] as const)('bounds repeated confirmed drift: %s', async boundary => {
    const f = fixture(); let now = 100000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    await f.controller.set('keepAwakeWhenLidClosed', true)
    f.guard.active = async () => {throw Error('system-changed')}
    expect((await f.controller.refresh()).keepAwakeWhenLidClosed).toBe(true)
    if (boundary === 'rate-limit') {now += 16000; expect((await f.controller.refresh()).keepAwakeWhenLidClosed).toBe(true); now += 16000}
    else now += 14000
    expect(await f.controller.refresh()).toMatchObject({keepAwakeWhenLidClosed: false, error: 'system-changed'})
    expect(f.authorizations).toEqual(boundary === 'rate-limit' ? [true, false, false] : [true, false])
    expect(f.store.getLid()).toBe(true)
    const rows = JSON.parse(readFileSync(join(f.root, 'power-diagnostics.json'), 'utf8'))
    expect(rows.at(-1)).toMatchObject({event: 'drift-recovery-blocked', code: boundary})
    f.controller.dispose()
  })

  it('allows later isolated drift after the rolling rate window expires', async () => {
    const f = fixture(); let now = 100000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    await f.controller.set('keepAwakeWhenLidClosed', true)
    f.guard.active = async () => {throw Error('system-changed')}
    for (let index = 0; index < 4; index++) {expect((await f.controller.refresh()).keepAwakeWhenLidClosed).toBe(true); now += 61000}
    expect(f.authorizations).toEqual([true, false, false, false, false])
    f.controller.dispose()
  })

  it.each(['user-off', 'safety-stop', 'dispose'] as const)('ignores a drift result superseded while checking the lease: %s', async action => {
    const f = fixture(); await f.controller.set('keepAwakeWhenLidClosed', true)
    let reject!: (error: Error) => void, entered = false
    f.guard.active = () => new Promise((_resolve, fail) => {entered = true; reject = fail})
    const refresh = f.controller.refresh()
    await vi.waitFor(() => expect(entered).toBe(true))
    const ending = action === 'user-off' ? f.controller.set('keepAwakeWhenLidClosed', false) : action === 'safety-stop' ? f.controller.safetyStop() : (f.controller.dispose(), Promise.resolve())
    reject(Error('system-changed')); await Promise.all([refresh, ending])
    expect(f.controller.get().keepAwakeWhenLidClosed).toBe(false)
    expect(f.authorizations).toEqual([true])
    f.controller.dispose()
  })

  it('does not loop after failing to retire the old lease and still allows an explicit off retry', async () => {
    const f = fixture(); await f.controller.set('keepAwakeWhenLidClosed', true)
    f.guard.active = async () => {throw Error('system-changed')}
    let stops = 0
    f.guard.stop = async () => {stops++; throw Error('restore-failed')}
    expect(await f.controller.refresh()).toMatchObject({keepAwakeWhenLidClosed: true, error: 'restore-failed'})
    await f.controller.refresh(); await f.controller.refresh()
    expect(stops).toBe(1); expect(f.authorizations).toEqual([true])
    f.guard.stop = async () => {}
    expect((await f.controller.set('keepAwakeWhenLidClosed', false)).keepAwakeWhenLidClosed).toBe(false)
    f.controller.dispose()
  })

  it('does not restore drift after the saved preference was independently turned off', async () => {
    const f = fixture(); await f.controller.set('keepAwakeWhenLidClosed', true)
    f.store.setLid(false)
    f.guard.active = async () => {throw Error('system-changed')}
    expect(await f.controller.refresh()).toMatchObject({keepAwakeWhenLidClosed: false, error: 'system-changed'})
    expect(f.authorizations).toEqual([true])
    f.controller.dispose()
  })

  it('rechecks thermal permission after the new lease finishes and releases that late lease', async () => {
    const f = fixture(); let safe = true
    const controller = new PowerSettingsController({store: f.store, guard: f.guard, blocker: {start: () => 2, stop: () => true, isStarted: () => true}, canPreventSleep: () => safe})
    await controller.set('keepAwakeWhenLidClosed', true)
    f.guard.active = async () => {throw Error('system-changed')}
    const start = f.guard.start
    let finish!: () => void, entered = false, cancellations = 0
    const cancel = f.guard.cancel; f.guard.cancel = () => {cancellations++; cancel()}
    f.guard.start = async allow => {entered = true; await new Promise<void>(resolve => {finish = resolve}); return start(allow)}
    const refresh = controller.refresh()
    await vi.waitFor(() => expect(entered).toBe(true))
    safe = false; finish()
    expect(await refresh).toMatchObject({keepAwakeWhenLidClosed: false, error: 'safety-stop'})
    expect(cancellations).toBe(1)
    expect(f.store.getLid()).toBe(true)
    controller.dispose()
  })

  it('does not let a superseded failed recovery disable monitoring of a newer explicit enable', async () => {
    const f = fixture(); await f.controller.set('keepAwakeWhenLidClosed', true)
    f.guard.active = async () => {throw Error('system-changed')}
    const start = f.guard.start
    let fail!: () => void, entered = false
    f.guard.start = async allow => {entered = true; f.authorizations.push(allow ?? true); await new Promise<void>((_resolve,reject) => {fail = () => reject(Error('helper-unavailable'))}); return 'active'}
    const refresh = f.controller.refresh()
    await vi.waitFor(() => expect(entered).toBe(true))
    const newer = f.controller.set('keepAwakeWhenLidClosed', true)
    f.guard.start = start; fail(); await Promise.all([refresh,newer])
    expect((await f.controller.refresh()).keepAwakeWhenLidClosed).toBe(true)
    expect(f.authorizations).toEqual([true,false,true,false])
    f.controller.dispose()
  })
})
