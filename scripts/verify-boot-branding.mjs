import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { installBootBranding, patchBootBranding } from './lib/boot-branding.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined
const packaged = option('--packaged-entry')
const output = option('--output')
const archives = option('--archives-dir')
const work = await mkdtemp(path.join(tmpdir(), 'ework-boot-branding-'))
const sha = s => createHash('sha256').update(s).digest('hex')
const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'))
const results = { work, packages: [], cases: [] }
const jsx = (type, props) => ({ type, ...props })
const react = { jsx, jsxs: jsx, Fragment: 'fragment', useSyncExternalStore: (_subscribe, read) => read() }
const text = tree => typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(text).join('|') : tree && typeof tree === 'object' ? text(tree.children) : ''
function check(source, label) {
  const patched = patchBootBranding(source, label)
  assert.equal(patchBootBranding(patched, label), patched)
  assert.deepEqual(patched.match(/@deepseek-ai\/[\w-]+/g), source.match(/@deepseek-ai\/[\w-]+/g))
  const ast = ts.createSourceFile('boot.js', patched, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  assert.equal(ast.parseDiagnostics.length, 0, 'JavaScript syntax: ' + label)
  const boot = ast.statements.find(n => ts.isFunctionDeclaration(n) && patched.slice(n.getStart(ast), n.end).includes('.wordmark'))
  assert.ok(boot, 'AppRoot function: ' + label)
  const code = patched.slice(boot.getStart(ast), boot.end)
  function render(language, settled, failed) {
    const store = value => ({ subscribe() {}, getSnapshot: () => value })
    const context = { ...react, navigator: { language }, props: { settled: store(settled), status: store(failed ? { '@deepseek-ai/compat-id': 'failed' } : {}), error: store(failed ? 'HARNESS_COMPAT diagnostic' : undefined), renderApp: () => 'real application' } }
    for (const m of code.matchAll(/([\w$]+)\.(?:useSyncExternalStore|jsx|jsxs)/g)) context[m[1]] = react
    for (const m of code.matchAll(/className:\s*([\w$]+)\./g)) context[m[1]] = {}
    return text(runInNewContext(`(${code})(props)`, context))
  }
  for (const language of ['zh-CN', 'zh-TW', 'en-US']) {
    const loading = render(language, false, false)
    assert.ok(loading.includes('EWork Odyssey'))
    assert.ok(loading.includes(language.startsWith('zh') ? '正在加载插件…' : 'Loading plugins…'))
    assert.ok(!loading.includes('HARNESS'))
    const failure = render(language, false, true)
    for (const retained of ['Failed to load plugins', '@deepseek-ai/compat-id', 'HARNESS_COMPAT diagnostic']) assert.ok(failure.includes(retained))
    assert.equal(render(language, true, false), 'real application')
  }
  results.cases.push({ label, beforeSha256: sha(source), afterSha256: sha(patched), repeatable: true, parsed: true, locales: ['zh-CN', 'zh-TW', 'en-US'], loading: true, failureProbeAndIdentifiersPreserved: true, settled: true })
  return patched
}

// Pristine bytes are verified against the existing lock, not a repacked local module.
for (const name of ['dsh-client-web', 'dsh-web-frontend']) {
  const key = 'node_modules/@deepseek-ai/' + name
  const metadata = lock.packages[key]
  let archive
  if (archives) {
    archive = await readFile(path.join(archives, name + '.tgz'))
  } else {
    const response = await fetch(metadata.resolved)
    assert.ok(response.ok, 'locked package fetch: ' + name)
    archive = Buffer.from(await response.arrayBuffer())
  }
  assert.equal('sha512-' + createHash('sha512').update(archive).digest('base64'), metadata.integrity)
  const tar = path.join(work, name + '.tgz')
  await writeFile(tar, archive)
  const destination = path.join(work, 'pristine', key)
  await mkdir(destination, { recursive: true })
  execFileSync('tar', ['-xzf', tar, '--strip-components=1', '-C', destination])
  results.packages.push({ name, archiveSource: archives ? path.join(archives, name + '.tgz') : metadata.resolved, version: metadata.version, resolved: metadata.resolved, integrity: metadata.integrity })
}
for (const baseline of ['pristine', 'installed']) {
  const fixture = path.join(work, baseline)
  if (baseline === 'installed') {
    for (const relative of ['node_modules/@deepseek-ai/dsh-client-web/lib/index.js', 'node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/' + (await readdir(path.join(root, 'node_modules/@deepseek-ai/dsh-web-frontend/dist/assets'))).find(n => /^index-.*\.js$/.test(n))]) {
      await mkdir(path.dirname(path.join(fixture, relative)), { recursive: true })
      await writeFile(path.join(fixture, relative), await readFile(path.join(root, relative)))
    }
  }
  const source = path.join(fixture, 'node_modules/@deepseek-ai/dsh-client-web/lib/index.js')
  const assets = path.join(fixture, 'node_modules/@deepseek-ai/dsh-web-frontend/dist/assets')
  const entry = path.join(assets, (await readdir(assets)).find(n => /^index-.*\.js$/.test(n)))
  const expected = new Map()
  for (const file of [source, entry]) expected.set(file, check(await readFile(file, 'utf8'), baseline + ':' + path.relative(fixture, file)))
  const installed = await installBootBranding(fixture)
  await installBootBranding(fixture)
  for (const file of installed) assert.equal(await readFile(file, 'utf8'), expected.get(file))
}
if (packaged) {
  const original = await readFile(packaged, 'utf8')
  const transformed = check(original, 'packaged-copy:' + packaged)
  await writeFile(path.join(work, 'packaged-entry-copy.js'), transformed)
  assert.equal(await readFile(packaged, 'utf8'), original, 'shared artifact must remain unchanged')
} else {
  results.packaged = 'not provided; no packaged artifact claim'
}
if (output) await writeFile(output, JSON.stringify(results, null, 2) + '\n')
console.log(JSON.stringify(results, null, 2))
