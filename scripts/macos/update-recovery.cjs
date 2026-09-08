// Loaded before the old application exits. Only macOS system tools are used after
// that point, so replacing/renaming the app cannot invalidate our launch path.
const fs = require('node:fs')
const path = require('node:path')
const { fileURLToPath, pathToFileURL } = require('node:url')
const { execFileSync } = require('node:child_process')
const BUNDLE_ID = 'com.evanarts.sherlock'
const run = (command, args) => execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 })
const plist = file => JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', file]))
function localBundleURL(value) {
  const url = new URL(value)
  if (url.protocol !== 'file:' || url.host || url.search || url.hash) throw new Error('Invalid update bundle URL')
  const result = path.resolve(fileURLToPath(url))
  if (!result.endsWith('.app')) throw new Error('Invalid application path')
  return result
}
function resolveRenamePlan(state, currentApp, version, readInfo = app => plist(path.join(app, 'Contents/Info.plist'))) {
  if (state.bundleIdentifier !== BUNDLE_ID || localBundleURL(state.targetBundleURL) !== path.resolve(currentApp)) throw new Error('Installer target does not match this application')
  const staged = localBundleURL(state.updateBundleURL)
  const info = readInfo(staged)
  if (info.CFBundleIdentifier !== BUNDLE_ID || info.CFBundleShortVersionString !== version) throw new Error('Staged update identity/version mismatch')
  const target = state.useUpdateBundleName === true ? path.join(path.dirname(currentApp), path.basename(staged)) : currentApp
  return target === currentApp ? null : { oldApp: currentApp, targetApp: target, version }
}
function signatureHash(app) {
  // codesign diagnostic output is on stderr even on success.
  const { spawnSync } = require('node:child_process')
  const result = spawnSync('/usr/bin/codesign', ['-d', '--verbose=4', app], { encoding: 'utf8', timeout: 30000 })
  const hash = /^CDHash=([a-f0-9]+)$/m.exec(result.stderr || '')?.[1]
  if (result.status !== 0 || !hash) throw new Error('Cannot read verified update signature')
  return hash
}
function isExpectedBundle(app, version, hash) {
  try {
    const info = plist(path.join(app, 'Contents/Info.plist'))
    if (info.CFBundleIdentifier !== BUNDLE_ID || info.CFBundleShortVersionString !== version || signatureHash(app) !== hash) return false
    run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app])
    return true
  } catch { return false }
}
function migrateDockTiles(tiles, oldApp, targetApp, resolvePath = localBundleURL, targetURL = pathToFileURL(targetApp).href + "/", label = path.basename(targetApp, ".app")) {
  let changed = false
  const next = tiles.map(tile => {
    const data = tile?.['tile-data']
    const url = data?.['file-data']?.['_CFURLString']
    if (typeof url !== 'string') return tile
    let normalized
    try { normalized = resolvePath(url) } catch { return tile }
    if (normalized !== oldApp) return tile
    // Preserve GUID/order and other apps. Stale aliases/bookmarks must be removed
    // or Dock can resolve the old app again despite its new file URL.
    changed = true
    const updated = { ...data, 'file-label': label, 'bundle-identifier': BUNDLE_ID,
      'file-data': { _CFURLString: targetURL, _CFURLStringType: 15 } }
    delete updated.book
    delete updated['file-alias']
    return { ...tile, 'tile-data': updated }
  })
  return { changed, tiles: next }
}
function repairDock(oldApp, targetApp) {
  if (path.dirname(oldApp) !== path.dirname(targetApp) || fs.existsSync(oldApp)) return false
  if (plist(path.join(targetApp, 'Contents/Info.plist')).CFBundleIdentifier !== BUNDLE_ID) return false
  // CFPreferences is used instead of editing the on-disk plist behind cfprefsd.
  // The transform runs next to the read/write, preserving all unrelated settings.
  const script = `ObjC.import('Foundation');
const BUNDLE_ID = '${BUNDLE_ID}';
const migrateDockTiles = ${migrateDockTiles.toString()};
function run(argv) {
  const defaults = $.NSUserDefaults.alloc.initWithSuiteName('com.apple.dock');
  const original = ObjC.deepUnwrap(defaults.objectForKey('persistent-apps')) || [];
  const resolvePath = raw => { const url = $.NSURL.URLWithString(raw); if (!url || !url.isFileURL) return null; return ObjC.unwrap(url.path); };
  const result = migrateDockTiles(original, argv[0], '', resolvePath, argv[1], argv[2]);
  if (result.changed) { defaults.setObjectForKey($(result.tiles), 'persistent-apps'); defaults.synchronize; }
  return result.changed ? 'changed' : 'unchanged';
}`
  const result = run('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script, oldApp, pathToFileURL(targetApp).href + '/', path.basename(targetApp, '.app')]).trim()
  if (result !== 'changed') return false
  // Restart only this user's Dock after a real change, never another user's Dock.
  try { run('/usr/bin/killall', ['-u', String(process.getuid()), 'Dock']) } catch { /* Dock may not be running in this login session. */ }
  return true
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
function processAlive(pid) { try { process.kill(pid, 0); return true } catch { return false } }
function appRunning(target) {
  return run('/bin/ps', ['-wwaxo', 'command=']).split('\n').some(line => line.startsWith(path.join(target, 'Contents/MacOS') + '/'))
}
async function guard(options, dependencies = {}) {
  const now = dependencies.now || Date.now
  const pause = dependencies.sleep || sleep
  const alive = dependencies.processAlive || processAlive
  const expected = dependencies.isExpectedBundle || isExpectedBundle
  const running = dependencies.appRunning || appRunning
  const dock = dependencies.repairDock || repairDock
  const launch = dependencies.launch || (target => run('/usr/bin/open', ['-a', target]))
  const { parentPid, oldApp, targetApp, version, hash } = options
  if (!Number.isInteger(parentPid) || parentPid < 2 || !hash || path.dirname(oldApp) !== path.dirname(targetApp)) throw new Error('Invalid relaunch guard')
  const log = message => { try { fs.appendFileSync(options.logFile, `${new Date().toISOString()} ${message}\n`, { mode: 0o600 }) } catch {} }
  dependencies.ready?.()
  const deadline = now() + 300000
  while (alive(parentPid) && now() < deadline) await pause(500)
  if (alive(parentPid)) { log('Cancelled: original app is still running.'); return }
  while (now() < deadline) {
    if (expected(targetApp, version, hash)) {
      // Give ShipIt its normal relaunch window, then use the installed bundle's
      // absolute URL only if no process from that exact bundle has appeared.
      await pause(4000)
      if (!expected(targetApp, version, hash)) continue
      try { dock(oldApp, targetApp) } catch (error) { log(`Dock repair deferred: ${error.message}`) }
      if (!running(targetApp)) launch(targetApp)
      log(`Verified renamed update and recovered launch: ${targetApp}`)
      return
    }
    await pause(1000)
  }
  log('Recovery timed out; no unverified application was launched.')
}
module.exports = { BUNDLE_ID, resolveRenamePlan, migrateDockTiles, repairDock, signatureHash, isExpectedBundle, guard }
if (require.main === module) {
  const options = JSON.parse(process.argv[2])
  const action = options.action === 'repair-dock' ? Promise.resolve().then(() => repairDock(options.oldApp, options.targetApp)) : guard(options, { ready: () => { process.send?.({ ready: true }); process.disconnect?.() } })
  action.catch(error => { console.error('[update-recovery]', error.message); process.exitCode = 1 }).finally(() => {
    if (path.basename(__dirname).startsWith('odyssey-update-recovery-')) fs.rmSync(__dirname, { recursive: true, force: true })
  })
}
