import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { HomeThemePreferenceStore, initializeFirstLaunchAppearance, registerHomeThemePreferences } from '../src/main/home-theme-preferences'
import type { TrustedWindowEvent } from '../src/main/ipc-trust'

const directories: string[] = []
function directory(): string {
  const result = mkdtempSync(join(tmpdir(), 'ework-home-theme-'))
  directories.push(result)
  return result
}
afterEach(() => { for (const value of directories.splice(0)) rmSync(value, { recursive: true, force: true }) })

it('defaults a fresh installation to dark and Nebula Storm and preserves later choices', () => {
  const userData = directory()
  const settings = join(userData, 'harness', 'settings.yaml')
  initializeFirstLaunchAppearance(userData)
  expect(readFileSync(settings, 'utf8')).toBe('ui-theme:\n  preference: dark\n')
  const store = new HomeThemePreferenceStore(userData)
  expect(store.get()).toBe('shashidhar')
  writeFileSync(settings, 'ui-theme:\n  preference: light\nlocale:\n  preference: zh\n')
  expect(store.set('random')).toBe(true)
  initializeFirstLaunchAppearance(userData)
  expect(readFileSync(settings, 'utf8')).toBe('ui-theme:\n  preference: light\nlocale:\n  preference: zh\n')
  expect(new HomeThemePreferenceStore(userData).get()).toBe('random')
})

it.each(['harness', 'launch-root'])('retains an existing profile without explicit appearance settings (%s)', folder => {
  const userData = directory()
  mkdirSync(join(userData, folder))
  initializeFirstLaunchAppearance(userData)
  expect(existsSync(join(userData, 'harness', 'settings.yaml'))).toBe(false)
  expect(new HomeThemePreferenceStore(userData).get()).toBeNull()
})

it('writes the selected theme before returning and restores it from disk after a new store starts', () => {
  const userData = directory(), store = new HomeThemePreferenceStore(userData)
  expect(store.get()).toBeNull()
  expect(store.set('jarrick')).toBe(true)
  expect(JSON.parse(readFileSync(join(userData, 'home-theme.json'), 'utf8'))).toEqual({ version: 1, theme: 'jarrick' })
  expect(new HomeThemePreferenceStore(userData).get()).toBe('jarrick')
})

it('rejects invalid choices without changing the existing valid record', () => {
  const userData = directory(), store = new HomeThemePreferenceStore(userData)
  store.set('jarrick')
  const file = join(userData, 'home-theme.json'), saved = readFileSync(file, 'utf8')
  for (const value of [null, undefined, '', 'unknown', 'liquid-chrome', '../dark', {}, [], 1, 'x'.repeat(10_000)]) {
    expect(store.set(value)).toBe(false)
    expect(readFileSync(file, 'utf8')).toBe(saved)
    expect(new HomeThemePreferenceStore(userData).get()).toBe('jarrick')
  }
})

it('persists Koi Pond as a native theme across application restarts', () => {
  const userData = directory(), store = new HomeThemePreferenceStore(userData)
  expect(store.set('koi-pond')).toBe(true)
  expect(new HomeThemePreferenceStore(userData).get()).toBe('koi-pond')
})

it.each(['{broken', 'null', '[]', '{"version":2,"theme":"jarrick"}', '{"version":1,"theme":"unknown"}', 'x'.repeat(513)])('ignores malformed preference data without rewriting the file (%#)', value => {
  const userData = directory(), file = join(userData, 'home-theme.json')
  writeFileSync(file, value)
  expect(new HomeThemePreferenceStore(userData).get()).toBeNull()
  expect(readFileSync(file, 'utf8')).toBe(value)
})

it('migrates previously removed theme identifiers on read', () => {
  const userData = directory()
  writeFileSync(join(userData, 'home-theme.json'), JSON.stringify({ version: 1, theme: 'liquid-chrome' }))
  expect(new HomeThemePreferenceStore(userData).get()).toBe('default')
})

it('allows synchronous preference IPC only from the current main frame', () => {
  const userData = directory()
  type Event = TrustedWindowEvent & { returnValue: unknown }
  const listeners = new Map<string, (event: Event, value?: unknown) => void>()
  const webContents = { mainFrame: { processId: 7, routingId: 41 } }
  registerHomeThemePreferences({ removeAllListeners: name => listeners.delete(name), on: (name, listener) => listeners.set(name, listener) }, () => ({ isDestroyed: () => false, webContents }), userData)
  const event = (): Event => ({ sender: webContents, senderFrame: webContents.mainFrame, returnValue: undefined })
  const write = event()
  listeners.get('desktop-home-theme:set')!(write, 'jarrick')
  expect(write.returnValue).toBe(true)
  const read = event()
  listeners.get('desktop-home-theme:get')!(read)
  expect(read.returnValue).toBe('jarrick')
  for (const invalid of [{ ...event(), sender: {} }, { ...event(), senderFrame: { processId: 7, routingId: 42 } }, { ...event(), senderFrame: null }]) {
    listeners.get('desktop-home-theme:set')!(invalid, 'default')
    expect(invalid.returnValue).toBe(false)
    listeners.get('desktop-home-theme:get')!(invalid)
    expect(invalid.returnValue).toBeNull()
    expect(new HomeThemePreferenceStore(userData).get()).toBe('jarrick')
  }
})

it('persists random wallpaper mode independently from its current rendered theme',()=>{
 const userData=directory(),store=new HomeThemePreferenceStore(userData)
 expect(store.set('random')).toBe(true);expect(new HomeThemePreferenceStore(userData).get()).toBe('random')
})
