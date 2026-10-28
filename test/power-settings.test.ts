import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
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
afterEach(() => {for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true})})

describe('power preference lifecycle', () => {
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
  it('reports system drift, releases the lease, and leaves ordinary sleep prevention in place', async () => {
    const f = fixture()
    await f.controller.set('preventAutoSleep', true)
    await f.controller.set('keepAwakeWhenLidClosed', true)
    f.drift()
    expect(await f.controller.refresh()).toMatchObject({keepAwakeWhenLidClosed: false, preventAutoSleep: true, error: 'system-changed'})
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
})
