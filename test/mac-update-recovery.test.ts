import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
const { resolveRenamePlan, migrateDockTiles } = createRequire(import.meta.url)('../scripts/macos/update-recovery.cjs')
const oldApp = '/Users/test/Applications/中文 空间/Sherlock.app'
const targetApp = '/Users/test/Applications/中文 空间/EWork Odyssey.app'
const staged = '/private/tmp/update.abcd/EWork Odyssey.app'
const info = { CFBundleIdentifier: 'com.evanarts.sherlock', CFBundleShortVersionString: '0.9.2' }
const state = { bundleIdentifier: info.CFBundleIdentifier, targetBundleURL: pathToFileURL(oldApp).href + '/', updateBundleURL: pathToFileURL(staged).href + '/', useUpdateBundleName: true }
it('uses the post-install path for a renamed signed bundle, including spaces and Chinese paths', () => {
  expect(resolveRenamePlan(state, oldApp, '0.9.2', () => info)).toEqual({ oldApp, targetApp, version: '0.9.2', bundleId: info.CFBundleIdentifier })
})
it('keeps user-renamed bundles in place and does not arm a second launcher for same-name updates', () => {
  expect(resolveRenamePlan({ ...state, useUpdateBundleName: false }, oldApp, '0.9.2', () => info)).toBeNull()
  expect(resolveRenamePlan({ ...state, targetBundleURL: pathToFileURL(targetApp).href }, targetApp, '0.9.2', () => info)).toBeNull()
})
it.each([
  { bundleIdentifier: 'other.app' },
  { targetBundleURL: 'file:///Applications/Sherlock.app/' },
  { updateBundleURL: 'https://example.com/Update.app/' },
  { updateBundleURL: 'file://other-host/Update.app/' }
])('rejects unrelated or nonlocal installer targets %j', invalid => {
  expect(() => resolveRenamePlan({ ...state, ...invalid }, oldApp, '0.9.2', () => info)).toThrow()
})
it.each([{ ...info, CFBundleIdentifier: 'other.app' }, { ...info, CFBundleShortVersionString: '0.9.1' }])('rejects a stale or different staged bundle', invalid => {
  expect(() => resolveRenamePlan(state, oldApp, '0.9.2', () => invalid)).toThrow('identity/version')
})
it('repairs only the exact old Dock URL, preserving order and removing stale bookmark resolution', () => {
  const old = { GUID: 1, 'tile-type': 'file-tile', 'tile-data': { book: 'stale', 'file-alias': 'old', 'file-label': 'Sherlock', 'file-data': { _CFURLString: pathToFileURL(oldApp).href + '/', _CFURLStringType: 15 } } }
  const unrelated = { GUID: 2, 'tile-data': { 'file-data': { _CFURLString: 'file:///Applications/Other.app/' } } }
  const otherCopy = { GUID: 3, 'tile-data': { 'file-data': { _CFURLString: 'file:///Applications/Sherlock.app/' } } }
  const original = [unrelated, old, otherCopy]
  const result = migrateDockTiles(original, oldApp, targetApp)
  expect(result.changed).toBe(true)
  expect(result.tiles[0]).toBe(unrelated)
  expect(result.tiles[2]).toBe(otherCopy)
  expect(result.tiles[1]).toMatchObject({ GUID: 1, 'tile-data': { 'file-label': 'EWork Odyssey', 'file-data': { _CFURLString: pathToFileURL(targetApp).href + '/' } } })
  expect(result.tiles[1]['tile-data']).not.toHaveProperty('book')
  expect(result.tiles[1]['tile-data']).not.toHaveProperty('file-alias')
  expect(old['tile-data'].book).toBe('stale')
  expect(migrateDockTiles(result.tiles, oldApp, targetApp).changed).toBe(false)
})
it('does not add a Dock shortcut or touch malformed entries', () => {
  const tiles = [{ GUID: 1 }, { 'tile-data': { 'file-data': { _CFURLString: 'https://example.com/' } } }]
  expect(migrateDockTiles(tiles, oldApp, targetApp)).toEqual({ changed: false, tiles })
})

it('waits for the old process and a stable verified replacement, then launches only the renamed path', async () => {
  const { guard } = createRequire(import.meta.url)('../scripts/macos/update-recovery.cjs')
  let clock = 0, alive = true, installed = false
  const launched: string[] = [], repaired: string[][] = []
  await guard({ parentPid: 42, oldApp, targetApp, version: '0.9.2', hash: 'verified-hash' }, {
    now: () => clock,
    sleep: async (ms: number) => { clock += ms; alive = false; if (clock >= 1500) installed = true },
    processAlive: () => alive,
    isExpectedBundle: (target: string, version: string, hash: string) => target === targetApp && version === '0.9.2' && hash === 'verified-hash' && installed,
    appRunning: () => false,
    repairDock: (...paths: string[]) => repaired.push(paths),
    launch: (target: string) => launched.push(target)
  })
  expect(launched).toEqual([targetApp])
  expect(repaired).toEqual([[oldApp, targetApp]])
  expect(clock).toBeGreaterThanOrEqual(5500)
})
it.each(['still-running', 'invalid-replacement', 'already-relaunched'])('does not launch in the %s case', async scenario => {
  const { guard } = createRequire(import.meta.url)('../scripts/macos/update-recovery.cjs')
  let clock = 0
  const launched: string[] = []
  await guard({ parentPid: 42, oldApp, targetApp, version: '0.9.2', hash: 'hash' }, {
    now: () => clock,
    sleep: async () => { clock += 300001 },
    processAlive: () => scenario === 'still-running',
    isExpectedBundle: () => scenario === 'already-relaunched',
    appRunning: () => true, repairDock: () => {},
    launch: (target: string) => launched.push(target)
  })
  expect(launched).toEqual([])
})

it.skipIf(process.platform !== 'darwin')('verifies the installed signed bundle after a real filesystem rename and rejects tampering', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, renameSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { execFileSync } = await import('node:child_process')
  const { signatureHash, isExpectedBundle } = createRequire(import.meta.url)('../scripts/macos/update-recovery.cjs')
  const root = mkdtempSync(join(tmpdir(), 'odyssey-rename-signature-test-'))
  const original = join(root, 'Sherlock.app'), renamed = join(root, 'EWork Odyssey.app')
  try {
    mkdirSync(join(original, 'Contents', 'MacOS'), { recursive: true })
    const info = `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.evanarts.sherlock</string><key>CFBundleExecutable</key><string>Fixture</string><key>CFBundleShortVersionString</key><string>0.9.2</string></dict></plist>`
    writeFileSync(join(original, 'Contents', 'Info.plist'), info)
    writeFileSync(join(original, 'Contents', 'MacOS', 'Fixture'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
    execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', original], { stdio: 'pipe' })
    const hash = signatureHash(original)
    renameSync(original, renamed)
    expect(isExpectedBundle(original, '0.9.2', hash)).toBe(false)
    expect(isExpectedBundle(renamed, '0.9.2', hash)).toBe(true)
    expect(isExpectedBundle(renamed, '0.9.1', hash)).toBe(false)
    writeFileSync(join(renamed, 'Contents', 'Info.plist'), info.replace('0.9.2', '0.9.3'))
    expect(isExpectedBundle(renamed, '0.9.3', hash)).toBe(false)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it('keeps the legacy signed update channel bound to its own bundle identity', () => {
  const legacy = { ...info, CFBundleIdentifier: 'io.dsh.desktop' }
  expect(resolveRenamePlan({ ...state, bundleIdentifier: 'io.dsh.desktop' }, oldApp, '0.9.2', () => legacy)).toMatchObject({ bundleId: 'io.dsh.desktop', targetApp })
  expect(() => resolveRenamePlan({ ...state, bundleIdentifier: 'io.dsh.desktop' }, oldApp, '0.9.2', () => info)).toThrow('identity/version')
})

it.skipIf(process.platform !== 'darwin')('preserves native binary bookmarks of unrelated Dock entries through CFPreferences', async () => {
  const { execFileSync } = await import('node:child_process')
  const { randomUUID } = await import('node:crypto')
  const { dockMigrationScript } = createRequire(import.meta.url)('../scripts/macos/update-recovery.cjs')
  const domain = `com.evanarts.sherlock.dock-test-${randomUUID()}`
  const script = dockMigrationScript('com.evanarts.sherlock', domain).replace('function run(argv)', 'function migrate(argv)') + `
function run() {
  const domain = ${JSON.stringify(domain)};
  const defaults = $.NSUserDefaults.alloc.initWithSuiteName(domain);
  try {
    const book = $.NSData.alloc.initWithBase64EncodedStringOptions('YWJjZGVm', 0);
    const tiles = [
      {GUID:10,'tile-data':{'file-label':'Sherlock','file-data':{_CFURLString:'file:///Applications/Sherlock.app/'},book}},
      {GUID:20,'tile-data':{'file-label':'Untouched','file-data':{_CFURLString:'file:///Applications/Other.app/'},book}}
    ];
    defaults.setObjectForKey($(tiles), 'persistent-apps'); defaults.synchronize;
    const outcome = migrate(['/Applications/Sherlock.app','file:///Applications/EWork%20Odyssey.app/','EWork Odyssey']);
    const saved = defaults.objectForKey('persistent-apps');
    const other = saved.objectAtIndex(1).objectForKey('tile-data').objectForKey('book');
    const first = ObjC.deepUnwrap(saved.objectAtIndex(0));
    const repeated = migrate(['/Applications/Sherlock.app','file:///Applications/EWork%20Odyssey.app/','EWork Odyssey']);
    return JSON.stringify({outcome,repeated,bookmark:ObjC.unwrap(other.base64EncodedStringWithOptions(0)),guid:first.GUID,label:first['tile-data']['file-label'],removed:!first['tile-data'].book});
  } finally { defaults.removePersistentDomainForName(domain); defaults.synchronize; }
}`
  const result = JSON.parse(execFileSync('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script], { encoding: 'utf8', timeout: 10000 }))
  expect(result).toEqual({ outcome: 'changed', repeated: 'unchanged', bookmark: 'YWJjZGVm', guid: 10, label: 'EWork Odyssey', removed: true })
})
