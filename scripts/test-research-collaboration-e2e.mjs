// Local-only collaboration acceptance. No install, native build, remote migration or deploy.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile, readdir, realpath } from 'node:fs/promises'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { Window } from 'happy-dom'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
assert.equal(await realpath(process.cwd()), await realpath(root), 'Run from the feature/integration checkout')
const output = join(root, 'output/research-collaboration-e2e')
await mkdir(output, { recursive: true })
const runDir = await mkdtemp(join(output, 'run-'))
const selected = process.argv.slice(2)
assert.ok(selected.length === 0 || (selected.length === 2 && selected[0] === '--stage' && ['sources', 'browser', 'worker', 'focused', 'typecheck', 'dry-run'].includes(selected[1])), 'Usage: node scripts/test-research-collaboration-e2e.mjs [--stage sources|browser|worker|focused|typecheck|dry-run]')
const stages = selected.length ? [selected[1]] : ['focused', 'typecheck', 'worker', 'sources', 'browser', 'dry-run']
const result = { startedAt: new Date().toISOString(), root, runDir, stages: [], exclusions: ['native packaged client', 'paid provider', 'live Cloudflare', 'capacity/load test'] }
const require = createRequire(import.meta.url)
function run(argv, { cwd = root, env = {}, timeoutMs = 180000 } = {}) {
  const r = spawnSync(argv[0], argv.slice(1), { cwd, env: { ...process.env, ...env }, timeout: timeoutMs, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  const log = (r.stdout ?? '') + (r.stderr ?? '')
  if (r.status !== 0) throw Object.assign(Error(`${argv.join(' ')} failed (${r.status ?? r.error?.message})\n${log.slice(-10000)}`), { log, argv })
  return log
}
const git = (...args) => run(['git', ...args]).trim()
result.featureTip = git('rev-parse', 'HEAD')
result.mainTip = git('rev-parse', 'main')
result.sourceCleanAtStart = git('status', '--porcelain') === ''
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
async function treeHashes(dir) {
  const files = {}
  async function walk(path, prefix = '') {
    for (const e of await readdir(path, { withFileTypes: true })) {
      const relative = prefix + e.name
      if (e.isDirectory()) await walk(join(path, e.name), relative + '/')
      else if (e.isFile()) files[relative] = hash(await readFile(join(path, e.name)))
      else throw Error('Unexpected symlink in clean package fixture: ' + relative)
    }
  }
  await walk(dir)
  return files
}
async function executeModule(path, kind) {
  const window = new Window({ url: 'http://127.0.0.1/' })
  let descriptor
  window.__ModuleLoader__ = { load: value => { descriptor = value } }
  runInNewContext(await readFile(path, 'utf8'), {
    window, document: window.document, navigator: window.navigator,
    localStorage: window.localStorage, sessionStorage: window.sessionStorage,
    CustomEvent: window.CustomEvent, TextEncoder, TextDecoder, AbortController,
    setTimeout, clearTimeout, queueMicrotask, console
  }, { timeout: 15000 })
  const fallback = new Proxy(function () {}, { get: () => fallback, apply: () => undefined, construct: () => ({}) })
  const mod = descriptor.factory(id => ['react', 'react/jsx-runtime', 'react-dom'].includes(id) ? require(id) : fallback)
  assert.equal(typeof mod.apply, 'function')
  if (kind === 'conversation') {
    const workspace = new mod.ResearchWorkspaceRegistry().for('clean-private-session')
    workspace.setArtifacts([{ id: 'clean-node', messageId: 'clean-node', kind: 'pasted-text', title: '清洁来源', excerpt: '可执行输入', x: 12, y: 34, width: 300, height: 180 }])
    assert.equal(workspace.getSnapshot().artifacts[0].excerpt, '可执行输入')
    assert.equal(workspace.getSnapshot().artifacts[0].x, 12)
  }
  await window.happyDOM.close()
}
async function sources() {
  const inventory = JSON.parse(await readFile(join(root, 'output/research-boards-source-inputs-20260909/verified-inputs.json'), 'utf8'))
  const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'))
  const names = ['dsh-client-ui-conversation', 'dsh-client-ui-sidebar', 'dsh-client-ui-primitives', 'dsh-web-frontend']
  assert.deepEqual(inventory.map(p => p.name.split('/')[1]).sort(), [...names].sort())
  for (const p of inventory) {
    assert.equal(p.version, '0.1.0-rc.7')
    assert.equal('sha512-' + createHash('sha512').update(await readFile(p.archive)).digest('base64'), p.integrity)
    assert.equal(lock.packages['node_modules/' + p.name].integrity, p.integrity)
    assert.equal(lock.packages['node_modules/' + p.name].resolved, p.resolved)
  }
  const baselines = []
  for (const baseline of ['feature', 'main-conversation']) {
    const fixture = join(runDir, baseline)
    await mkdir(fixture, { recursive: true })
    for (const p of inventory) {
      const destination = join(fixture, 'node_modules', p.name)
      await mkdir(destination, { recursive: true })
      run(['tar', '-xzf', p.archive, '--strip-components=1', '-C', destination])
      const patchName = p.name.replace('/', '+') + '+0.1.0-rc.7.patch'
      const patchFile = join(runDir, baseline + '-' + patchName)
      const patch = baseline === 'main-conversation' && p.name.endsWith('conversation')
        ? run(['git', 'show', result.mainTip + ':patches/' + patchName])
        : await readFile(join(root, 'patches', patchName), 'utf8')
      await writeFile(patchFile, patch)
      run(['patch', '--batch', '--forward', '--dry-run', '-p1', '-i', patchFile], { cwd: fixture })
      run(['patch', '--batch', '--forward', '-p1', '-i', patchFile], { cwd: fixture })
    }
    run([process.execPath, join(root, 'scripts/patch-web-frontend-loading.mjs')], { cwd: fixture })
    const once = await treeHashes(join(fixture, 'node_modules'))
    run([process.execPath, join(root, 'scripts/patch-web-frontend-loading.mjs')], { cwd: fixture })
    assert.deepEqual(await treeHashes(join(fixture, 'node_modules')), once, baseline + ' second transform changes bytes')
    for (const kind of ['conversation', 'sidebar']) await executeModule(join(fixture, 'node_modules/@deepseek-ai/dsh-client-ui-' + kind + '/lib/client.js'), kind)
    baselines.push({ baseline, fixture, hashes: once, factoryExecution: 'passed' })
  }
  const installed = join(runDir, 'installed-local-packages')
  await mkdir(installed, { recursive: true })
  const packs = []
  for (const name of ['dsh-research-collaboration', 'dsh-research-task-runtime']) {
    const meta = JSON.parse(run(['npm', 'pack', '--ignore-scripts', '--json', '--pack-destination', installed], { cwd: join(root, 'packages', name) }))[0]
    const names = meta.files.map(f => f.path)
    if (name.endsWith('collaboration')) for (const file of ['context.js', 'context.d.ts']) assert.ok(names.includes(file))
    else assert.ok(names.includes('board-runtime.js'))
    const destination = join(installed, 'node_modules', name)
    await mkdir(destination, { recursive: true })
    run(['tar', '-xzf', join(installed, meta.filename), '--strip-components=1', '-C', destination])
    packs.push({ name, filename: meta.filename, integrity: meta.integrity, files: names })
  }
  const context = await import(pathToFileURL(join(installed, 'node_modules/dsh-research-collaboration/context.js')))
  assert.equal(context.exportHumanHistory([{ type: 'user/message', surfaceOp: 'append', data: { id: 'installed-message', source: { kind: 'user' }, content: [{ type: 'text', text: '安装布局读取' }] } }])[0].text, '安装布局读取')
  const { SharedExecutionRuntime, fileExecutionStorage } = await import(pathToFileURL(join(installed, 'node_modules/dsh-research-task-runtime/board-runtime.js')))
  let count = 0
  const runtime = new SharedExecutionRuntime({ storage: fileExecutionStorage(join(installed, 'state.json')), execute: async () => { count++; return '安装布局执行' } })
  await runtime.restore()
  const request = { taskId: 'installed-task', sessionId: 'private', kind: 'qa', prompt: '合成问题' }
  await runtime.start(request)
  await runtime.flights.get(request.taskId)
  assert.equal(runtime.inspect(request.taskId).text, '安装布局执行')
  await runtime.start(request)
  assert.equal(count, 1)
  await runtime.dispose()
  const manifest = { featureTip: result.featureTip, mainTip: result.mainTip, inventory, baselines, packs, browserFixture: baselines[1].fixture, installedRuntime: 'passed; internal relative sibling paths, not public subpath exports' }
  await writeFile(join(runDir, 'sources.json'), JSON.stringify(manifest, null, 2))
  await writeFile(join(output, 'latest-sources.json'), JSON.stringify(manifest, null, 2))
  return 'Both exact rc.7 baselines: SHA512, patch, double-transform hashes, factory execution; packed sibling context/runtime execution passed.'
}
const focused = ['research-board-document.test.js', 'research-boards-store.test.ts', 'collaboration-client.test.ts', 'research-boards-service.test.ts', 'research-boards-ui.test.ts', 'research-board-client-adapter.test.js', 'research-board-snapshot.test.ts', 'research-board-assets.test.ts', 'research-board-tasks.test.ts', 'research-board-runtime.test.js', 'account-service.test.ts', 'ipc-trust.test.ts', 'research-context-bridge.test.ts', 'research-task-runtime.test.js', 'research-workbench.test.js', 'research-file-preview.test.ts', 'research-canvas-clipboard.test.ts', 'sidebar-update-control.test.ts']
try {
  for (const name of stages) {
    const stage = { name, startedAt: new Date().toISOString(), timeoutMs: 300000, status: 'running' }
    result.stages.push(stage)
    console.log('START ' + name)
    try {
      let log
      if (name === 'sources') log = await sources()
      else {
        let env = {}
        const argv = name === 'focused' ? [join(root, 'node_modules/.bin/vitest'), 'run', ...focused.map(p => 'test/' + p)]
          : name === 'typecheck' ? ['npm', 'run', 'typecheck']
          : name === 'worker' ? [process.execPath, 'scripts/test-collaboration-worker.mjs']
          : name === 'dry-run' ? [join(root, 'node_modules/.bin/wrangler'), 'deploy', '--dry-run', '--config', 'services/collaboration/wrangler.jsonc']
          : [process.execPath, 'scripts/test-research-boards-browser.mjs']
        if (name === 'browser') {
          const manifest = JSON.parse(await readFile(join(output, 'latest-sources.json'), 'utf8'))
          assert.equal(manifest.featureTip, result.featureTip, 'Regenerate clean inputs after source commit changes')
          assert.equal(manifest.mainTip, result.mainTip, 'Regenerate clean inputs after main advances')
          env = { SHERLOCK_COLLABORATION_PACKAGE_FIXTURE: manifest.browserFixture }
          stage.packageFixture = manifest.browserFixture
        }
        stage.argv = argv
        log = run(argv, { env, timeoutMs: stage.timeoutMs })
      }
      await writeFile(join(runDir, name + '.log'), log)
      stage.status = 'passed'
      console.log('PASS ' + name)
    } catch (error) {
      stage.status = 'failed'
      stage.error = error.message
      await writeFile(join(runDir, name + '.log'), error.log ?? error.stack)
      throw error
    } finally { stage.completedAt = new Date().toISOString() }
  }
  run(['git', 'diff', '--check'])
  result.status = 'passed'
} catch (error) {
  result.status = 'failed'
  console.error(error.message)
  process.exitCode = 1
} finally {
  result.completedAt = new Date().toISOString()
  await writeFile(join(runDir, 'results.json'), JSON.stringify(result, null, 2))
  await writeFile(join(output, 'latest-results.json'), JSON.stringify(result, null, 2))
  console.log('RESULTS=' + join(runDir, 'results.json'))
}
